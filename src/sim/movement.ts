import type { CollisionMap } from './collision-map';
import { PLAYER_RADIUS, PLAYER_SPEED, TICK_MS, TILE_SIZE } from './constants';
import type { PlayerInput, Vec2 } from './types';

const EPS = 1e-6;

/** Moves one axis of an axis-aligned box (the circle's bounds) and stops it flush against solid tiles. */
function moveAxis(pos: Vec2, r: number, delta: number, axis: 'x' | 'y', map: CollisionMap): number {
  if (delta === 0) return pos[axis];
  const target = pos[axis] + delta;
  const other = axis === 'x' ? pos.y : pos.x;
  const oMin = Math.floor((other - r + EPS) / TILE_SIZE);
  const oMax = Math.floor((other + r - EPS) / TILE_SIZE);
  const lead = delta > 0 ? target + r : target - r;
  const from = Math.floor((delta > 0 ? pos[axis] + r - EPS : pos[axis] - r + EPS) / TILE_SIZE);
  const to = Math.floor((delta > 0 ? lead - EPS : lead + EPS) / TILE_SIZE);
  const step = delta > 0 ? 1 : -1;
  for (let t = from + step; step > 0 ? t <= to : t >= to; t += step) {
    for (let o = oMin; o <= oMax; o++) {
      const solid = axis === 'x' ? map.isSolidTile(t, o) : map.isSolidTile(o, t);
      if (solid) return delta > 0 ? t * TILE_SIZE - r : (t + 1) * TILE_SIZE + r;
    }
  }
  return target;
}

/** Moves a circle (approximated by its bounding box) by (dx, dy), resolving X then Y. */
export function moveCircle(pos: Vec2, radius: number, dx: number, dy: number, map: CollisionMap): Vec2 {
  const x = moveAxis(pos, radius, dx, 'x', map);
  const y = moveAxis({ x, y: pos.y }, radius, dy, 'y', map);
  return { x, y };
}

/** Advances a player one simulation tick according to its input (speed in px/s). */
export function stepPlayerMovement(pos: Vec2, input: PlayerInput, map: CollisionMap, speed: number = PLAYER_SPEED): Vec2 {
  const len = Math.hypot(input.moveX, input.moveY);
  if (len === 0 || speed <= 0) return { x: pos.x, y: pos.y };
  const dist = (speed * TICK_MS) / 1000;
  return moveCircle(pos, PLAYER_RADIUS, (input.moveX / len) * dist, (input.moveY / len) * dist, map);
}

/** Direction of a dodge: the movement input if any, otherwise towards the aim point. */
export function dodgeDirection(pos: Vec2, input: { moveX: number; moveY: number; aimX: number; aimY: number }): Vec2 {
  let dx = input.moveX;
  let dy = input.moveY;
  if (dx === 0 && dy === 0) {
    dx = input.aimX - pos.x;
    dy = input.aimY - pos.y;
  }
  const l = Math.hypot(dx, dy);
  return l < 1e-6 ? { x: 0, y: 1 } : { x: dx / l, y: dy / l };
}
