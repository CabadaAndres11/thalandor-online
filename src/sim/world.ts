import type { Appearance, ClassId } from '../appearance/catalog';
import type { CollisionMap } from './collision-map';
import { PLAYER_RADIUS, TILE_SIZE } from './constants';
import { DOWN, facingFromVector, type Facing } from './facing';
import { stepPlayerMovement } from './movement';
import type { EntityId, PlayerInput, Vec2 } from './types';

/** Ticks without a moving input before a player counts as standing (hides single lost packets). */
const IDLE_TICKS_TO_STOP = 5;

export interface PlayerInfo {
  name: string;
  classId: ClassId;
  appearance: Appearance;
}

export interface PlayerState extends PlayerInfo {
  id: EntityId;
  pos: Vec2;
  lastInputSeq: number;
  facing: Facing;
  moving: boolean;
  /** Ticks since the last input that had movement. */
  idleTicks: number;
}

export interface PlayerSnapshot {
  id: EntityId;
  name: string;
  x: number;
  y: number;
  lastInputSeq: number;
  facing: number;
  moving: boolean;
}

export interface WorldSnapshot {
  tick: number;
  players: PlayerSnapshot[];
}

/** Authoritative world state for one zone. Pure simulation: no I/O, no timers. */
export class World {
  tick = 0;
  private nextId = 1;
  private readonly players = new Map<EntityId, PlayerState>();
  private readonly pending = new Map<EntityId, PlayerInput[]>();

  constructor(
    readonly map: CollisionMap,
    readonly spawn: Vec2,
  ) {}

  addPlayer(info: PlayerInfo, at?: Vec2): PlayerState {
    const p: PlayerState = {
      id: this.nextId++,
      name: info.name,
      classId: info.classId,
      appearance: info.appearance,
      pos: { ...(at ?? this.spawn) },
      lastInputSeq: 0,
      facing: DOWN,
      moving: false,
      idleTicks: IDLE_TICKS_TO_STOP,
    };
    this.players.set(p.id, p);
    this.pending.set(p.id, []);
    return p;
  }

  removePlayer(id: EntityId): void {
    this.players.delete(id);
    this.pending.delete(id);
  }

  getPlayer(id: EntityId): PlayerState | undefined {
    return this.players.get(id);
  }

  allPlayers(): PlayerState[] {
    return [...this.players.values()];
  }

  queueInput(id: EntityId, input: PlayerInput): void {
    this.pending.get(id)?.push(input);
  }

  /** True when a player circle centred at p touches no solid tile. */
  isSpawnable(p: Vec2): boolean {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    const x0 = Math.floor((p.x - PLAYER_RADIUS) / TILE_SIZE);
    const x1 = Math.floor((p.x + PLAYER_RADIUS - 1e-6) / TILE_SIZE);
    const y0 = Math.floor((p.y - PLAYER_RADIUS) / TILE_SIZE);
    const y1 = Math.floor((p.y + PLAYER_RADIUS - 1e-6) / TILE_SIZE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.map.isSolidTile(tx, ty)) return false;
    return true;
  }

  step(): void {
    for (const p of this.players.values()) {
      const queue = this.pending.get(p.id) ?? [];
      queue.sort((a, b) => a.seq - b.seq);
      let movedThisTick = false;
      for (const input of queue) {
        if (input.seq <= p.lastInputSeq) continue;
        const moves = input.moveX !== 0 || input.moveY !== 0;
        if (moves) {
          p.facing = facingFromVector(input.moveX, input.moveY, p.facing);
          movedThisTick = true;
        } else {
          p.facing = facingFromVector(input.aimX - p.pos.x, input.aimY - p.pos.y, p.facing);
        }
        p.pos = stepPlayerMovement(p.pos, input, this.map);
        p.lastInputSeq = input.seq;
        if (!moves) p.idleTicks = IDLE_TICKS_TO_STOP;
      }
      if (movedThisTick) p.idleTicks = 0;
      else if (p.idleTicks < IDLE_TICKS_TO_STOP) p.idleTicks++;
      p.moving = p.idleTicks < IDLE_TICKS_TO_STOP;
      queue.length = 0;
    }
    this.tick++;
  }

  snapshot(): WorldSnapshot {
    const players: PlayerSnapshot[] = [];
    for (const p of this.players.values()) {
      players.push({ id: p.id, name: p.name, x: p.pos.x, y: p.pos.y, lastInputSeq: p.lastInputSeq, facing: p.facing, moving: p.moving });
    }
    return { tick: this.tick, players };
  }
}
