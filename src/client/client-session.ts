import type { CollisionMap } from '../sim/collision-map';
import { INTERP_DELAY_MS, TICK_MS } from '../sim/constants';
import type { EntityId, PlayerInput, Press, PressSlot, Vec2 } from '../sim/types';
import type { MeSnapshot, UnitSnapshot, WorldSnapshot } from '../sim/world';
import type { CombatEvent } from '../sim/combat/events';
import { ability, CLASSES } from '../sim/combat/defs';
import type { ActionAnim } from '../appearance/catalog-types';
import { decodeHost, encode, type NetCharacter, type RejectReason, type RosterEntry } from '../net/protocol';
import { dodgeDirection } from '../sim/movement';
import { facingFromVector, DOWN, type Facing } from '../sim/facing';
import type { Appearance, ClassId } from '../appearance/catalog';
import type { Connection } from '../net/transport';
import { Predictor } from './prediction';
import { SnapshotBuffer } from './interpolation';
import { ServerClock } from './server-clock';

export const SNAPSHOT_TIMEOUT_MS = 5000;
const MAX_PENDING_PRESSES = 16;

export interface ClientEvents {
  welcome: { playerId: EntityId; mapId: string };
  rejected: { reason: RejectReason };
  chat: { from: string; text: string };
  joined: { playerId: EntityId; name: string };
  left: { playerId: EntityId; name: string };
  roster: { players: RosterEntry[] };
  combat: { list: CombatEvent[] };
  disconnected: Record<string, never>;
}

export interface UnitRender {
  id: EntityId;
  kind: 'player' | 'monster';
  /** classId for players, monster type for monsters. */
  type: string;
  name: string;
  pos: Vec2;
  facing: number;
  moving: boolean;
  hp: number;
  maxHp: number;
  state: 'alive' | 'downed' | 'dead';
  /** One-shot animation and its start time in local ms. */
  action: { anim: ActionAnim; startedAt: number } | null;
  classId?: ClassId;
  appearance?: Appearance;
}

export interface SelfRender {
  pos: Vec2;
  facing: number;
  moving: boolean;
  hp: number;
  maxHp: number;
  state: 'alive' | 'downed' | 'dead';
  action: { anim: ActionAnim; startedAt: number } | null;
}

export interface RenderState {
  self: SelfRender | null;
  /** Every other unit in range (players and monsters). */
  others: Map<EntityId, UnitRender>;
}

export interface ClientSessionOptions {
  version: string;
  character: NetCharacter;
  map: CollisionMap;
  now?: () => number;
}

type Listeners = { [K in keyof ClientEvents]: ((p: ClientEvents[K]) => void)[] };

/** Client half of a game: sends inputs and presses, predicts self, interpolates others, surfaces events. */
export class ClientSession {
  playerId: EntityId | null = null;
  private readonly now: () => number;
  private readonly predictor: Predictor;
  private readonly buffer = new SnapshotBuffer();
  private readonly clock = new ServerClock();
  private readonly listeners: Listeners = { welcome: [], rejected: [], chat: [], joined: [], left: [], roster: [], combat: [], disconnected: [] };
  private readonly classId: string;
  private seq = 0;
  private pressSeq = 0;
  private presses: Press[] = [];
  private predictedDodges = new Set<number>();
  private selfKnown = false;
  private prevSelf: Vec2 = { x: 0, y: 0 };
  private lastStepAt = 0;
  private lastSnapshotAt: number;
  private snapshotAt = 0;
  private ended = false;
  private roster = new Map<EntityId, RosterEntry>();
  private rosterSeen = false;
  private selfFacing: Facing = DOWN;
  private selfMoving = false;
  private selfUnit: UnitSnapshot | null = null;
  private localAction: { anim: ActionAnim; startedAt: number } | null = null;
  private me: MeSnapshot | null = null;

  constructor(
    private readonly conn: Connection,
    opts: ClientSessionOptions,
  ) {
    this.now = opts.now ?? (() => performance.now());
    this.predictor = new Predictor(opts.map);
    this.classId = opts.character.classId;
    this.lastSnapshotAt = this.now();
    conn.onMessage((raw) => this.onMessage(raw));
    conn.onClose(() => this.end());
    conn.send(encode({ t: 'hello', version: opts.version, character: opts.character }), 'reliable');
  }

  on<K extends keyof ClientEvents>(event: K, cb: (payload: ClientEvents[K]) => void): void {
    this.listeners[event].push(cb);
  }

  /** The host's private block for this player (resources, cooldowns…), or null before the first one. */
  get meState(): MeSnapshot | null {
    return this.me;
  }

  /**
   * Registers a key press for an ability slot (or the dodge). It is sent with every input until the
   * host acknowledges it, so a lost packet never loses a press. Plays the own attack animation at once.
   */
  press(slot: PressSlot, aim: Vec2): void {
    if (this.ended) return;
    this.presses.push({ seq: ++this.pressSeq, slot, aimX: aim.x, aimY: aim.y });
    if (this.presses.length > MAX_PENDING_PRESSES) this.presses.shift();
    if (slot !== 'dodge' && this.selfUnit?.state === 'alive') {
      const abilityId = CLASSES[this.classId]?.slots[slot];
      const ab = abilityId ? ability(abilityId) : undefined;
      const ready = (this.me?.cd[slot] ?? 0) <= 0 && (!ab?.gcd || (this.me?.gcd ?? 0) <= 0) && (this.me?.resource ?? 0) >= (ab?.cost ?? 0);
      if (ab && ab.anim !== 'none' && ready) {
        this.localAction = { anim: ab.anim, startedAt: this.now() };
        this.selfFacing = facingFromVector(aim.x - this.predictor.pos.x, aim.y - this.predictor.pos.y, this.selfFacing);
      }
    }
  }

  sendInput(i: { moveX: number; moveY: number; aimX: number; aimY: number; buttons?: number }): void {
    if (this.ended) return;
    const acked = this.me?.lastPressSeq ?? 0;
    this.presses = this.presses.filter((p) => p.seq > acked);
    const input: PlayerInput = { seq: ++this.seq, ...i, buttons: i.buttons ?? 0, presses: [...this.presses] };
    let dodge: Vec2 | null = null;
    for (const p of this.presses) {
      if (p.slot !== 'dodge' || this.predictedDodges.has(p.seq)) continue;
      this.predictedDodges.add(p.seq);
      const canDodge = (this.me?.cd.dodge ?? 0) <= 0 && (this.me?.canMove ?? true) && !this.predictor.dashing && this.selfUnit?.state === 'alive';
      if (canDodge) dodge = dodgeDirection(this.predictor.pos, i);
    }
    this.prevSelf = { ...this.predictor.pos };
    this.predictor.applyLocal(input, dodge);
    this.lastStepAt = this.now();
    this.selfMoving = (i.moveX !== 0 || i.moveY !== 0) && (this.me?.canMove ?? true);
    const pos = this.predictor.pos;
    if (!this.localActionPlaying()) {
      this.selfFacing = i.moveX !== 0 || i.moveY !== 0 ? facingFromVector(i.moveX, i.moveY, this.selfFacing) : facingFromVector(i.aimX - pos.x, i.aimY - pos.y, this.selfFacing);
    }
    this.conn.send(encode({ t: 'input', input }), 'unreliable');
  }

  sendChat(text: string): void {
    const trimmed = text.trim();
    if (trimmed && !this.ended) this.conn.send(encode({ t: 'chat', text: trimmed }), 'reliable');
  }

  private localActionPlaying(): boolean {
    return !!this.localAction && this.now() - this.localAction.startedAt < 500;
  }

  renderState(localMs: number): RenderState {
    let self: SelfRender | null = null;
    if (this.selfKnown && this.selfUnit) {
      const cur = this.predictor.pos;
      const a = Math.min(1, Math.max(0, (localMs - this.lastStepAt) / TICK_MS));
      const pos = { x: this.prevSelf.x + (cur.x - this.prevSelf.x) * a, y: this.prevSelf.y + (cur.y - this.prevSelf.y) * a };
      const u = this.selfUnit;
      const action = this.localAction && localMs - this.localAction.startedAt < 1000 ? this.localAction : this.unitAction(u);
      self = { pos, facing: this.selfFacing, moving: this.selfMoving && u.state === 'alive', hp: u.hp, maxHp: u.maxHp, state: u.state, action };
    }
    const latest = new Map((this.buffer.latest?.units ?? []).map((u) => [u.id, u]));
    const others = new Map<EntityId, UnitRender>();
    for (const [id, pos] of this.buffer.sample(this.clock.serverTimeMs(localMs) - INTERP_DELAY_MS)) {
      if (id === this.playerId) continue;
      const u = latest.get(id);
      if (!u) continue;
      const info = this.roster.get(id);
      const r: UnitRender = {
        id,
        kind: u.kind,
        type: u.type,
        name: u.kind === 'player' ? (info?.name ?? u.name) : u.name,
        pos,
        facing: u.facing,
        moving: u.moving,
        hp: u.hp,
        maxHp: u.maxHp,
        state: u.state,
        action: this.unitAction(u),
      };
      if (info) {
        r.classId = info.classId;
        r.appearance = info.appearance;
      }
      others.set(id, r);
    }
    return { self, others };
  }

  private unitAction(u: UnitSnapshot): { anim: ActionAnim; startedAt: number } | null {
    return u.action ? { anim: u.action.anim, startedAt: this.snapshotAt - u.action.ms } : null;
  }

  /** The host's latest position for the local player (used for saving), or null before the first snapshot. */
  selfLocation(): Vec2 | null {
    return this.selfUnit ? { x: this.selfUnit.x, y: this.selfUnit.y } : null;
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
        this.onSnapshot(msg.s, msg.me);
        break;
      case 'events':
        this.emit('combat', { list: msg.list });
        break;
      case 'roster': {
        if (this.rosterSeen) {
          for (const p of msg.players) if (!this.roster.has(p.id) && p.id !== this.playerId) this.emit('joined', { playerId: p.id, name: p.name });
        }
        this.rosterSeen = true;
        this.roster = new Map(msg.players.map((p) => [p.id, p]));
        this.emit('roster', { players: msg.players });
        break;
      }
      case 'chat':
        this.emit('chat', { from: msg.from, text: msg.text });
        break;
      case 'left':
        this.emit('left', { playerId: msg.playerId, name: msg.name });
        break;
    }
  }

  private onSnapshot(s: WorldSnapshot, me: MeSnapshot | undefined): void {
    const t = this.now();
    this.lastSnapshotAt = t;
    this.snapshotAt = t;
    this.clock.observe(s.tick, t);
    this.buffer.push(s);
    if (me) {
      this.me = me;
      this.predictor.setMotion(me.moveSpeed, me.canMove);
    }
    const self = s.units.find((u) => u.id === this.playerId);
    if (self) {
      this.selfUnit = self;
      this.predictor.reconcile({ x: self.x, y: self.y }, self.lastInputSeq, me?.dash ?? null);
      if (!this.selfKnown) this.prevSelf = { ...this.predictor.pos };
      this.selfKnown = true;
    }
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
