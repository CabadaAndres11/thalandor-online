import { defaultAppearance, isClassId, isValidAppearance } from '../appearance/catalog';
import { MONSTERS } from '../sim/combat/defs';
import { MAX_PLAYERS } from '../sim/constants';
import type { EntityId, PlayerInput } from '../sim/types';
import type { World } from '../sim/world';
import { decodeClient, encode, type HostMessage, type NetCharacter, type RosterEntry } from '../net/protocol';
import type { Channel, Connection } from '../net/transport';

export const CONN_TIMEOUT_MS = 5000;
export const MAX_CHAT_LENGTH = 200;
export const MAX_NAME_LENGTH = 16;

export interface HostSessionOptions {
  version: string;
  mapId: string;
  /** Name used when a client sends an empty one (comes from i18n). */
  defaultName: string;
  /** Development builds only: chat commands "/dev spawn|hurt|kill" for testing. */
  devCommands?: boolean;
  now?: () => number;
}

interface Peer {
  conn: Connection;
  playerId: EntityId | null;
  name: string;
  lastSeen: number;
  gone: boolean;
  noTimeout: boolean;
}

const clampAxis = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

/** Wraps a World with connection handling: join/reject, inputs, snapshots, chat and timeouts. */
export class HostSession {
  private readonly peers = new Set<Peer>();
  private readonly now: () => number;

  constructor(
    private readonly world: World,
    private readonly opts: HostSessionOptions,
  ) {
    this.now = opts.now ?? (() => performance.now());
  }

  get playerCount(): number {
    let n = 0;
    for (const p of this.peers) if (p.playerId !== null) n++;
    return n;
  }

  /**
   * noTimeout: for the host's own in-process player. Its keep-alive runs on main-thread timers,
   * which browsers throttle hard in background tabs; it can never "drop off the network".
   */
  attach(conn: Connection, opts: { noTimeout?: boolean } = {}): void {
    const peer: Peer = { conn, playerId: null, name: '', lastSeen: this.now(), gone: false, noTimeout: opts.noTimeout ?? false };
    this.peers.add(peer);
    conn.onMessage((raw) => this.onMessage(peer, raw));
    conn.onClose(() => this.drop(peer));
  }

  tick(): void {
    this.world.step();
    const events = this.world.drainEvents();
    const eventsMsg = events.length ? encode({ t: 'events', list: events }) : null;
    const t = this.now();
    for (const p of this.peers) {
      if (!p.noTimeout && t - p.lastSeen > CONN_TIMEOUT_MS) {
        p.conn.close();
        this.drop(p);
      } else if (p.playerId !== null) {
        // Events first and reliable: hits and deaths must never be lost (damage numbers, death animations).
        if (eventsMsg) p.conn.send(eventsMsg, 'reliable');
        const { snap, me } = this.world.snapshotFor(p.playerId);
        p.conn.send(encode(me ? { t: 'snapshot', s: snap, me } : { t: 'snapshot', s: snap }), 'unreliable');
      }
    }
  }

  private onMessage(peer: Peer, raw: string): void {
    if (peer.gone) return;
    peer.lastSeen = this.now();
    const msg = decodeClient(raw);
    if (!msg) return;
    if (peer.playerId === null) {
      if (msg.t === 'hello') this.handleHello(peer, msg.version, msg.character);
      return;
    }
    if (msg.t === 'input') this.handleInput(peer.playerId, msg.input);
    else if (msg.t === 'chat') {
      const text = msg.text.trim().slice(0, MAX_CHAT_LENGTH);
      if (this.opts.devCommands && text.startsWith('/dev ')) return this.devCommand(peer.playerId, text.slice(5).split(/\s+/));
      if (text) this.broadcast({ t: 'chat', from: peer.name, text }, 'reliable');
    }
  }

  private handleHello(peer: Peer, version: string, c: NetCharacter): void {
    if (version !== this.opts.version) return this.reject(peer, 'version');
    if (this.playerCount >= MAX_PLAYERS) return this.reject(peer, 'full');
    const name = c.name.trim().slice(0, MAX_NAME_LENGTH) || this.opts.defaultName;
    const classId = isClassId(c.classId) ? c.classId : 'warrior';
    const appearance = isValidAppearance(c.appearance) ? { ...c.appearance } : defaultAppearance(classId);
    const saved = c.lastLocation;
    const at = saved && saved.mapId === this.opts.mapId && this.world.isSpawnable(saved) ? { x: saved.x, y: saved.y } : undefined;
    const player = this.world.addPlayer({ name, classId, appearance }, at);
    peer.playerId = player.id;
    peer.name = name;
    this.sendTo(peer, { t: 'welcome', playerId: player.id, mapId: this.opts.mapId }, 'reliable');
    this.broadcastRoster();
  }

  private devCommand(playerId: EntityId, args: string[]): void {
    const me = this.world.getPlayer(playerId);
    if (!me) return;
    const [cmd, a, b, c] = args;
    if (cmd === 'spawn' && a && Object.hasOwn(MONSTERS, a)) this.world.addMonster(a, { x: me.pos.x + Number(b ?? 0), y: me.pos.y + Number(c ?? 0) });
    else if (cmd === 'hurt') this.world.damage(me, Math.max(0, Number(a ?? 0)), null, 'physical');
    else if (cmd === 'kill') this.world.damage(me, me.hp + 9999, null, 'physical');
  }

  private broadcastRoster(): void {
    const players: RosterEntry[] = this.world
      .allPlayers()
      .map((p) => ({ id: p.id, name: p.name, classId: p.classId!, appearance: p.appearance! }));
    this.broadcast({ t: 'roster', players }, 'reliable');
  }

  private handleInput(id: EntityId, input: PlayerInput): void {
    if (!Number.isFinite(input.seq)) return;
    const pos = this.world.getPlayer(id)?.pos ?? { x: 0, y: 0 };
    const aimOk = Number.isFinite(input.aimX) && Number.isFinite(input.aimY);
    const presses = (input.presses ?? [])
      .filter((p) => Number.isFinite(p.seq))
      .map((p) => {
        const ok = Number.isFinite(p.aimX) && Number.isFinite(p.aimY);
        return { seq: p.seq, slot: p.slot, aimX: ok ? p.aimX : pos.x, aimY: ok ? p.aimY : pos.y };
      });
    const buttons = Number.isFinite(input.buttons) ? Math.max(0, Math.min(255, Math.floor(input.buttons ?? 0))) : 0;
    this.world.queueInput(id, {
      seq: input.seq,
      moveX: clampAxis(input.moveX),
      moveY: clampAxis(input.moveY),
      aimX: aimOk ? input.aimX : pos.x,
      aimY: aimOk ? input.aimY : pos.y,
      buttons,
      presses,
    });
  }

  private reject(peer: Peer, reason: 'version' | 'full'): void {
    this.sendTo(peer, { t: 'reject', reason }, 'reliable');
    peer.conn.close();
    this.drop(peer);
  }

  private drop(peer: Peer): void {
    if (peer.gone) return;
    peer.gone = true;
    this.peers.delete(peer);
    if (peer.playerId !== null) {
      this.world.removePlayer(peer.playerId);
      this.broadcast({ t: 'left', playerId: peer.playerId, name: peer.name }, 'reliable');
      this.broadcastRoster();
    }
  }

  private sendTo(peer: Peer, msg: HostMessage, channel: Channel): void {
    peer.conn.send(encode(msg), channel);
  }

  private broadcast(msg: HostMessage, channel: Channel): void {
    const data = encode(msg);
    for (const p of this.peers) if (p.playerId !== null) p.conn.send(data, channel);
  }
}
