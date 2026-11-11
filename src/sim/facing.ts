/** Facing directions, in the same order as the rows of LPC walk sheets. */
export const UP = 0;
export const LEFT = 1;
export const DOWN = 2;
export const RIGHT = 3;
export type Facing = 0 | 1 | 2 | 3;

/** Dominant axis of (dx, dy); ties go horizontal; a zero vector keeps the previous facing. */
export function facingFromVector(dx: number, dy: number, prev: Facing): Facing {
  if (dx === 0 && dy === 0) return prev;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? LEFT : RIGHT;
  return dy < 0 ? UP : DOWN;
}
