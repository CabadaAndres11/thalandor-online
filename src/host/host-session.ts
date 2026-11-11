import { MAX_PLAYERS } from '../sim/constants';
import type { EntityId, PlayerInput } from '../sim/types';
import type { World } from '../sim/world';
import { decodeClient, encode, type HostMessage } from '../net/protocol';
import type { Channel, Connection } from '../net/transport';

export const CONN_TIMEOUT_MS = 5000;
export const MAX_CHAT_LENGTH = 200;
export const MAX_NAME_LENGTH = 16;

export interface HostSessionOptions {
  version: string;
  mapId: string;
  /** Name used when a client sends an empty one (comes from i18n). */
  defaultName: string;
  now?: () => number;
}

interface Peer {
  conn: Connection;
  playerId: EntityId | null;
  name: string;
  lastSeen: number;
  gone: boolean;
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

  attach(conn: Connection): void {
    const peer: Peer = { conn, playerId: null, name: '', lastSeen: this.now(), gone: false };
    this.peers.add(peer);
    conn.onMessage((raw) => this.onMessage(peer, raw));
    conn.onClose(() => this.drop(peer));
  }

  tick(): void {
    this.world.step();
    const snap = encode({ t: 'snapshot', s: this.world.snapshot() });
    const t = this.now();
    for (const p of this.peers) {
      if (t - p.lastSeen > CONN_TIMEOUT_MS) {
        p.conn.close();
        this.drop(p);
      } else if (p.playerId !== null) {
        p.conn.send(snap, 'unreliable');
      }
    }
  }

  private onMessage(peer: Peer, raw: string): void {
    if (peer.gone) return;
    peer.lastSeen = this.now();
    const msg = decodeClient(raw);
    if (!msg) return;
    if (peer.playerId === null) {
      if (msg.t === 'hello') this.handleHello(peer, msg.version, msg.name);
      return;
    }
    if (msg.t === 'input') this.handleInput(peer.playerId, msg.input);
    else if (msg.t === 'chat') {
      const text = msg.text.trim().slice(0, MAX_CHAT_LENGTH);
      if (text) this.broadcast({ t: 'chat', from: peer.name, text }, 'reliable');
    }
  }

  private handleHello(peer: Peer, version: string, rawName: string): void {
    if (version !== this.opts.version) return this.reject(peer, 'version');
    if (this.playerCount >= MAX_PLAYERS) return this.reject(peer, 'full');
    const name = rawName.trim().slice(0, MAX_NAME_LENGTH) || this.opts.defaultName;
    const player = this.world.addPlayer(name);
    peer.playerId = player.id;
    peer.name = name;
    this.sendTo(peer, { t: 'welcome', playerId: player.id, mapId: this.opts.mapId }, 'reliable');
  }

  private handleInput(id: EntityId, input: PlayerInput): void {
    if (!Number.isFinite(input.seq)) return;
    const pos = this.world.getPlayer(id)?.pos ?? { x: 0, y: 0 };
    const aimOk = Number.isFinite(input.aimX) && Number.isFinite(input.aimY);
    this.world.queueInput(id, {
      seq: input.seq,
      moveX: clampAxis(input.moveX),
      moveY: clampAxis(input.moveY),
      aimX: aimOk ? input.aimX : pos.x,
      aimY: aimOk ? input.aimY : pos.y,
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
