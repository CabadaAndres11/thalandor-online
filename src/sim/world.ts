import type { CollisionMap } from './collision-map';
import { stepPlayerMovement } from './movement';
import type { EntityId, PlayerInput, Vec2 } from './types';

export interface PlayerState {
  id: EntityId;
  name: string;
  pos: Vec2;
  lastInputSeq: number;
}

export interface PlayerSnapshot {
  id: EntityId;
  name: string;
  x: number;
  y: number;
  lastInputSeq: number;
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
    private readonly spawn: Vec2,
  ) {}

  addPlayer(name: string): PlayerState {
    const p: PlayerState = { id: this.nextId++, name, pos: { ...this.spawn }, lastInputSeq: 0 };
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

  queueInput(id: EntityId, input: PlayerInput): void {
    this.pending.get(id)?.push(input);
  }

  step(): void {
    for (const [id, queue] of this.pending) {
      const p = this.players.get(id);
      if (!p || queue.length === 0) continue;
      queue.sort((a, b) => a.seq - b.seq);
      for (const input of queue) {
        if (input.seq <= p.lastInputSeq) continue;
        p.pos = stepPlayerMovement(p.pos, input, this.map);
        p.lastInputSeq = input.seq;
      }
      queue.length = 0;
    }
    this.tick++;
  }

  snapshot(): WorldSnapshot {
    const players: PlayerSnapshot[] = [];
    for (const p of this.players.values()) {
      players.push({ id: p.id, name: p.name, x: p.pos.x, y: p.pos.y, lastInputSeq: p.lastInputSeq });
    }
    return { tick: this.tick, players };
  }
}
