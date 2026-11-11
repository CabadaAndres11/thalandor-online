import { TICK_MS, TICK_RATE } from '../sim/constants';
import type { EntityId, Vec2 } from '../sim/types';
import type { WorldSnapshot } from '../sim/world';

/** Keeps ~1 s of snapshots and samples entity positions at an arbitrary host time. */
export class SnapshotBuffer {
  private snaps: WorldSnapshot[] = [];

  get size(): number {
    return this.snaps.length;
  }

  get latest(): WorldSnapshot | undefined {
    return this.snaps.at(-1);
  }

  push(s: WorldSnapshot): void {
    if (this.snaps.some((x) => x.tick === s.tick)) return;
    this.snaps.push(s);
    this.snaps.sort((a, b) => a.tick - b.tick);
    const newest = this.snaps.at(-1)!.tick;
    this.snaps = this.snaps.filter((x) => x.tick >= newest - TICK_RATE);
  }

  sample(serverTimeMs: number): Map<EntityId, Vec2> {
    if (this.snaps.length === 0) return new Map();
    const t = serverTimeMs / TICK_MS;
    const first = this.snaps[0]!;
    const last = this.snaps.at(-1)!;
    if (t <= first.tick) return positions(first);
    if (t >= last.tick) return positions(last);
    let i = 0;
    while (this.snaps[i + 1]!.tick < t) i++;
    const a = this.snaps[i]!;
    const b = this.snaps[i + 1]!;
    const alpha = (t - a.tick) / (b.tick - a.tick);
    const prev = new Map(a.players.map((p) => [p.id, p]));
    const out = new Map<EntityId, Vec2>();
    for (const p of b.players) {
      const q = prev.get(p.id);
      out.set(p.id, q ? { x: q.x + (p.x - q.x) * alpha, y: q.y + (p.y - q.y) * alpha } : { x: p.x, y: p.y });
    }
    return out;
  }
}

function positions(s: WorldSnapshot): Map<EntityId, Vec2> {
  return new Map(s.players.map((p) => [p.id, { x: p.x, y: p.y }]));
}
