/** Geometry of LPC per-animation sheets: walk.png is 9 columns x 4 rows (up, left, down, right). */
export const FRAME_SIZE = 64;
/** Frame 0 is the standing pose; 1..8 are the walk cycle. */
export const WALK_FRAMES = 9;
export const WALK_FPS = 10;

export function walkFrameRect(facing: number, frame: number): { x: number; y: number; w: number; h: number } {
  return { x: frame * FRAME_SIZE, y: facing * FRAME_SIZE, w: FRAME_SIZE, h: FRAME_SIZE };
}

/** Walk-cycle frame (1..8) for a time, or 0 when standing still. */
export function walkFrameAt(timeMs: number, moving: boolean): number {
  if (!moving) return 0;
  return 1 + (Math.floor((timeMs / 1000) * WALK_FPS) % (WALK_FRAMES - 1));
}
