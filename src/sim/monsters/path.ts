import type { CollisionMap } from '../collision-map';
import { TILE_SIZE } from '../constants';
import type { Vec2 } from '../types';

/** True when no solid tile lies on the segment a→b (sampled every 8 px). */
export function lineOfSight(map: CollisionMap, a: Vec2, b: Vec2): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(d / 8));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (map.isSolidAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

/** True when a circle of radius r can travel straight from a to b without touching solid tiles. */
export function clearPath(map: CollisionMap, a: Vec2, b: Vec2, r: number): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(d / 4));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const x0 = Math.floor((x - r) / TILE_SIZE);
    const x1 = Math.floor((x + r - 1e-6) / TILE_SIZE);
    const y0 = Math.floor((y - r) / TILE_SIZE);
    const y1 = Math.floor((y + r - 1e-6) / TILE_SIZE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (map.isSolidTile(tx, ty)) return false;
  }
  return true;
}

const center = (tx: number, ty: number): Vec2 => ({ x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 });

/**
 * A* over the collision grid (8 directions, no corner cutting). Returns waypoints (tile centres)
 * ending exactly at `to`; a direct [to] when there is a clear line; [] when unreachable.
 */
export function findPath(map: CollisionMap, from: Vec2, to: Vec2, maxNodes = 4000, radius = 0): Vec2[] {
  // A body with a radius needs the whole swept circle free, not just the centre line.
  if (radius > 0 ? clearPath(map, from, to, radius) : lineOfSight(map, from, to)) return [{ ...to }];
  const W = map.widthTiles;
  const sx = Math.floor(from.x / TILE_SIZE);
  const sy = Math.floor(from.y / TILE_SIZE);
  const gx = Math.floor(to.x / TILE_SIZE);
  const gy = Math.floor(to.y / TILE_SIZE);
  if (map.isSolidTile(gx, gy)) return [];
  const key = (x: number, y: number) => y * W + x;
  const g = new Map<number, number>([[key(sx, sy), 0]]);
  const parent = new Map<number, number>();
  const open: { k: number; x: number; y: number; f: number }[] = [{ k: key(sx, sy), x: sx, y: sy, f: 0 }];
  const closed = new Set<number>();
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  let found = false;
  while (open.length && closed.size < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]!.f < open[bi]!.f) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    if (closed.has(cur.k)) continue;
    closed.add(cur.k);
    if (cur.x === gx && cur.y === gy) {
      found = true;
      break;
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (map.isSolidTile(nx, ny)) continue;
        if (dx && dy && (map.isSolidTile(cur.x + dx, cur.y) || map.isSolidTile(cur.x, cur.y + dy))) continue;
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const ng = g.get(cur.k)! + (dx && dy ? Math.SQRT2 : 1);
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng);
          parent.set(nk, cur.k);
          open.push({ k: nk, x: nx, y: ny, f: ng + h(nx, ny) });
        }
      }
    }
  }
  if (!found) return [];
  const tiles: Vec2[] = [];
  let k: number | undefined = key(gx, gy);
  while (k !== undefined && k !== key(sx, sy)) {
    tiles.push(center(k % W, Math.floor(k / W)));
    k = parent.get(k);
  }
  tiles.reverse();
  tiles[tiles.length - 1] = { ...to };
  return tiles;
}
