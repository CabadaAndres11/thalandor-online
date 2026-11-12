import { defaultAppearance, isClassId, isValidAppearance } from '../appearance/catalog';
import { MONSTERS } from '../sim/combat/defs';
import { MAX_PLAYERS } from '../sim/constants';
import type { EntityId, PlayerInput } from '../sim/types';
import type { World } from '../sim/world';
import { sanitizeProgress } from '../sim/progression/validate';
import { applyProgressRequest, devSetLevel, gearLooksOf, inventoryInfo, progressInfo } from '../sim/progression/requests';
import { sanitizeBelongings } from '../sim/items/validate';
import { addItem } from '../sim/items/inventory';
import { basesFor, newPotion, rollGear } from '../sim/items/roll';
import { RARITIES, type ItemSlot } from '../sim/items/defs';
import type { CombatEvent } from '../sim/combat/events';
import { awardXp } from '../sim/progression/xp';
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
  /** Last gear looks sent in the roster (to rebroadcast when they change). */
  looks?: string;
}

/** The only player allowed to see an event, or null when everyone can. */
function ownerOf(e: CombatEvent): EntityId | null {
  return e.e === 'loot' || e.e === 'lootGone' || e.e === 'pickup' || e.e === 'bagFull' ? e.owner : null;
}

const clampAxis = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

/** Wraps a World with connection handling: join/reject, inputs, snapshots, chat and timeouts. */
export class HostSession {
  private readonly peers = new Set<Peer>();
  private pauseRequested = false;
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

  /** Solo pause: the world freezes only while the host is alone (a group game never stops). */
  setPaused(paused: boolean): void {
    this.pauseRequested = paused;
  }

  get paused(): boolean {
    return this.pauseRequested && this.playerCount <= 1;
  }

  tick(): void {
    // Snapshots keep flowing while paused so clients do not time out.
    if (!this.paused) this.world.step();
    const events = this.world.drainEvents();
    // Loot events are private to their owner; the rest go to everyone.
    const shared = events.filter((e) => ownerOf(e) === null);
    const eventsMsg = shared.length ? encode({ t: 'events', list: shared }) : null;
    const dirty = new Set(this.world.drainProgress());
    const invDirty = new Set(this.world.drainInventory());
    let rosterChanged = false;
    const t = this.now();
    for (const p of this.peers) {
      if (!p.noTimeout && t - p.lastSeen > CONN_TIMEOUT_MS) {
        p.conn.close();
        this.drop(p);
      } else if (p.playerId !== null) {
        // Events first and reliable: hits and deaths must never be lost (damage numbers, death animations).
        if (eventsMsg) p.conn.send(eventsMsg, 'reliable');
        const mine = events.filter((e) => ownerOf(e) === p.playerId);
        if (mine.length) this.sendTo(p, { t: 'events', list: mine }, 'reliable');
        if (dirty.has(p.playerId)) this.sendProgress(p);
        if (invDirty.has(p.playerId)) {
          this.sendInventory(p);
          const u = this.world.getPlayer(p.playerId);
          const looks = u ? JSON.stringify(gearLooksOf(u)) : '';
          if (looks !== p.looks) {
            p.looks = looks;
            rosterChanged = true;
          }
        }
        const { snap, me } = this.world.snapshotFor(p.playerId);
        p.conn.send(encode(me ? { t: 'snapshot', s: snap, me } : { t: 'snapshot', s: snap }), 'unreliable');
      }
    }
    if (rosterChanged) this.broadcastRoster();
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
    else if (msg.t === 'progress-req') {
      const u = this.world.getPlayer(peer.playerId);
      const r = u ? applyProgressRequest(this.world, u, msg.req) : 'invalid';
      if (r !== 'ok') this.sendTo(peer, { t: 'progress-refused', reason: r }, 'reliable');
    }
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
    const { progress } = sanitizeProgress(classId, c.progress);
    const belongings = sanitizeBelongings(c.belongings, classId, progress.level);
    const player = this.world.addPlayer({ name, classId, appearance, progress, belongings }, at);
    peer.looks = JSON.stringify(gearLooksOf(player));
    peer.playerId = player.id;
    peer.name = name;
    const m = this.world.merchant;
    this.sendTo(peer, { t: 'welcome', playerId: player.id, mapId: this.opts.mapId, ...(m ? { merchant: { x: m.pos.x, y: m.pos.y } } : {}) }, 'reliable');
    this.sendProgress(peer);
    this.sendInventory(peer);
    this.broadcastRoster();
  }

  private devCommand(playerId: EntityId, args: string[]): void {
    const me = this.world.getPlayer(playerId);
    if (!me) return;
    const [cmd, a, b, c] = args;
    if (cmd === 'spawn' && a && Object.hasOwn(MONSTERS, a)) this.world.addMonster(a, { x: me.pos.x + Number(b ?? 0), y: me.pos.y + Number(c ?? 0) });
    else if (cmd === 'hurt') this.world.damage(me, Math.max(0, Number(a ?? 0)), null, 'physical');
    else if (cmd === 'kill') this.world.damage(me, me.hp + 9999, null, 'physical');
    else if (cmd === 'xp') awardXp(this.world, me, Math.max(0, Number(a ?? 0)) || 0);
    else if (cmd === 'level' && Number.isFinite(Number(a))) devSetLevel(this.world, me, Number(a));
    else if (cmd === 'gold') {
      me.gold += Math.max(0, Math.floor(Number(a ?? 0))) || 0;
      this.world.markInventory(me.id);
    } else if (cmd === 'item') this.devItem(me, a, b);
    else if (cmd === 'potion') {
      addItem(me, newPotion(a === 'resource' ? 'resource' : 'health', Math.max(1, Math.min(20, Number(b ?? 5) || 5)), this.world.rng));
      this.world.markInventory(me.id);
    }
  }

  private sendInventory(peer: Peer): void {
    const u = peer.playerId !== null ? this.world.getPlayer(peer.playerId) : undefined;
    if (u) this.sendTo(peer, { t: 'inventory', inv: inventoryInfo(this.world, u) }, 'reliable');
  }

  private sendProgress(peer: Peer): void {
    const u = peer.playerId !== null ? this.world.getPlayer(peer.playerId) : undefined;
    if (u) this.sendTo(peer, { t: 'progress', p: progressInfo(u) }, 'reliable');
  }

  /** /dev item <rarity> [slot]: a random item of the player's level for its class. */
  private devItem(me: NonNullable<ReturnType<World['getPlayer']>>, rarity?: string, slot?: string): void {
    const r = (RARITIES as readonly string[]).includes(rarity ?? '') ? (rarity as (typeof RARITIES)[number]) : 'rare';
    const list = basesFor(me.level, { classId: me.classId, ...(slot ? { slot: slot as ItemSlot } : {}) });
    const base = list[Math.floor(this.world.rng() * list.length)];
    if (!base) return;
    addItem(me, rollGear(base, me.level, r, this.world.rng));
    this.world.markInventory(me.id);
  }

  private broadcastRoster(): void {
    const players: RosterEntry[] = this.world
      .allPlayers()
      .map((p) => ({ id: p.id, name: p.name, classId: p.classId!, appearance: p.appearance!, gear: gearLooksOf(p) }));
    this.broadcast({ t: 'roster', players }, 'reliable');
  }

  private handleInput(id: EntityId, input: PlayerInput): void {
    if (this.paused) return;
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
