import type { CollisionMap } from '../sim/collision-map';
import { INTERP_DELAY_MS, TICK_MS } from '../sim/constants';
import type { EntityId, PlayerInput, Vec2 } from '../sim/types';
import type { WorldSnapshot } from '../sim/world';
import { decodeHost, encode, type NetCharacter, type RejectReason, type RosterEntry } from '../net/protocol';
import { facingFromVector, DOWN, type Facing } from '../sim/facing';
import type { Appearance, ClassId } from '../appearance/catalog';
import type { Connection } from '../net/transport';
import { Predictor } from './prediction';
import { SnapshotBuffer } from './interpolation';
import { ServerClock } from './server-clock';

export const SNAPSHOT_TIMEOUT_MS = 5000;

export interface ClientEvents {
  welcome: { playerId: EntityId; mapId: string };
  rejected: { reason: RejectReason };
  chat: { from: string; text: string };
  joined: { playerId: EntityId; name: string };
  left: { playerId: EntityId; name: string };
  roster: { players: RosterEntry[] };
  disconnected: Record<string, never>;
}

export interface SelfRender {
  pos: Vec2;
  facing: number;
  moving: boolean;
}

export interface OtherRender {
  name: string;
  pos: Vec2;
  facing: number;
  moving: boolean;
  classId?: ClassId;
  appearance?: Appearance;
}

export interface RenderState {
  self: SelfRender | null;
  others: Map<EntityId, OtherRender>;
}

export interface ClientSessionOptions {
  version: string;
  character: NetCharacter;
  map: CollisionMap;
  now?: () => number;
}

type Listeners = { [K in keyof ClientEvents]: ((p: ClientEvents[K]) => void)[] };

/** Client half of a game: sends inputs, predicts self, interpolates others, surfaces events. */
export class ClientSession {
  playerId: EntityId | null = null;
  private readonly now: () => number;
  private readonly predictor: Predictor;
  private readonly buffer = new SnapshotBuffer();
  private readonly clock = new ServerClock();
  private readonly known = new Set<EntityId>();
  private readonly listeners: Listeners = { welcome: [], rejected: [], chat: [], joined: [], left: [], roster: [], disconnected: [] };
  private seq = 0;
  private selfKnown = false;
  private prevSelf: Vec2 = { x: 0, y: 0 };
  private lastStepAt = 0;
  private lastSnapshotAt: number;
  private firstSnapshot = true;
  private ended = false;
  private roster = new Map<EntityId, RosterEntry>();
  private selfFacing: Facing = DOWN;
  private selfMoving = false;
  private authoritativeSelf: Vec2 | null = null;

  constructor(
    private readonly conn: Connection,
    opts: ClientSessionOptions,
  ) {
    this.now = opts.now ?? (() => performance.now());
    this.predictor = new Predictor(opts.map);
    this.lastSnapshotAt = this.now();
    conn.onMessage((raw) => this.onMessage(raw));
    conn.onClose(() => this.end());
    conn.send(encode({ t: 'hello', version: opts.version, character: opts.character }), 'reliable');
  }

  on<K extends keyof ClientEvents>(event: K, cb: (payload: ClientEvents[K]) => void): void {
    this.listeners[event].push(cb);
  }

  sendInput(i: Omit<PlayerInput, 'seq'>): void {
    if (this.ended) return;
    const input: PlayerInput = { seq: ++this.seq, ...i };
    this.prevSelf = { ...this.predictor.pos };
    this.predictor.applyLocal(input);
    this.lastStepAt = this.now();
    this.selfMoving = i.moveX !== 0 || i.moveY !== 0;
    const pos = this.predictor.pos;
    this.selfFacing = this.selfMoving
      ? facingFromVector(i.moveX, i.moveY, this.selfFacing)
      : facingFromVector(i.aimX - pos.x, i.aimY - pos.y, this.selfFacing);
    this.conn.send(encode({ t: 'input', input }), 'unreliable');
  }

  sendChat(text: string): void {
    const trimmed = text.trim();
    if (trimmed && !this.ended) this.conn.send(encode({ t: 'chat', text: trimmed }), 'reliable');
  }

  renderState(localMs: number): RenderState {
    let self: SelfRender | null = null;
    if (this.selfKnown) {
      const cur = this.predictor.pos;
      const a = Math.min(1, Math.max(0, (localMs - this.lastStepAt) / TICK_MS));
      const pos = { x: this.prevSelf.x + (cur.x - this.prevSelf.x) * a, y: this.prevSelf.y + (cur.y - this.prevSelf.y) * a };
      self = { pos, facing: this.selfFacing, moving: this.selfMoving };
    }
    const latest = new Map((this.buffer.latest?.players ?? []).map((p) => [p.id, p]));
    const others = new Map<EntityId, OtherRender>();
    for (const [id, pos] of this.buffer.sample(this.clock.serverTimeMs(localMs) - INTERP_DELAY_MS)) {
      if (id === this.playerId) continue;
      const snap = latest.get(id);
      const info = this.roster.get(id);
      const o: OtherRender = { name: snap?.name ?? info?.name ?? '', pos, facing: snap?.facing ?? DOWN, moving: snap?.moving ?? false };
      if (info) {
        o.classId = info.classId;
        o.appearance = info.appearance;
      }
      others.set(id, o);
    }
    return { self, others };
  }

  /** The host's latest position for the local player (used for saving), or null before the first snapshot. */
  selfLocation(): Vec2 | null {
    return this.authoritativeSelf ? { ...this.authoritativeSelf } : null;
  }

  /** Call regularly (e.g. every frame); ends the session if the host went silent. */
  checkTimeout(localMs: number): void {
    if (localMs - this.lastSnapshotAt > SNAPSHOT_TIMEOUT_MS) this.end();
  }

  /** Leaves voluntarily; does not emit 'disconnected'. */
  close(): void {
    this.ended = true;
    this.conn.close();
  }

  private onMessage(raw: string): void {
    if (this.ended) return;
    const msg = decodeHost(raw);
    if (!msg) return;
    switch (msg.t) {
      case 'welcome':
        this.playerId = msg.playerId;
        this.emit('welcome', { playerId: msg.playerId, mapId: msg.mapId });
        break;
      case 'reject':
        this.ended = true;
        this.emit('rejected', { reason: msg.reason });
        break;
      case 'snapshot':
        this.onSnapshot(msg.s);
        break;
      case 'roster':
        this.roster = new Map(msg.players.map((p) => [p.id, p]));
        this.emit('roster', { players: msg.players });
        break;
      case 'chat':
        this.emit('chat', { from: msg.from, text: msg.text });
        break;
      case 'left':
        this.known.delete(msg.playerId);
        this.emit('left', { playerId: msg.playerId, name: msg.name });
        break;
    }
  }

  private onSnapshot(s: WorldSnapshot): void {
    const t = this.now();
    this.lastSnapshotAt = t;
    this.clock.observe(s.tick, t);
    this.buffer.push(s);
    const ids = new Set<EntityId>();
    for (const p of s.players) {
      ids.add(p.id);
      if (p.id === this.playerId) {
        this.authoritativeSelf = { x: p.x, y: p.y };
        this.predictor.reconcile({ x: p.x, y: p.y }, p.lastInputSeq);
        if (!this.selfKnown) this.prevSelf = { ...this.predictor.pos };
        this.selfKnown = true;
      } else if (!this.known.has(p.id)) {
        this.known.add(p.id);
        if (!this.firstSnapshot) this.emit('joined', { playerId: p.id, name: p.name });
      }
    }
    for (const id of this.known) if (!ids.has(id)) this.known.delete(id);
    this.firstSnapshot = false;
  }

  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.emit('disconnected', {});
  }

  private emit<K extends keyof ClientEvents>(event: K, payload: ClientEvents[K]): void {
    for (const cb of this.listeners[event]) cb(payload);
  }
}
