import type { Anim } from './catalog-types';

/** Geometry of LPC per-animation sheets. Rows are up, left, down, right (hurt has a single row). */
export const FRAME_SIZE = 64;
/** Frame 0 is the standing pose; 1..8 are the walk cycle. */
export const WALK_FRAMES = 9;
export const WALK_FPS = 10;

export const ANIM_GEOMETRY: Record<Anim, { frames: number; rows: number; msPerFrame: number }> = {
  walk: { frames: 9, rows: 4, msPerFrame: 100 },
  slash: { frames: 6, rows: 4, msPerFrame: 55 },
  thrust: { frames: 8, rows: 4, msPerFrame: 45 },
  spellcast: { frames: 7, rows: 4, msPerFrame: 55 },
  shoot: { frames: 13, rows: 4, msPerFrame: 35 },
  hurt: { frames: 6, rows: 1, msPerFrame: 90 },
};

/** Total duration of a one-shot animation. */
export const animDurationMs = (anim: Anim) => ANIM_GEOMETRY[anim].frames * ANIM_GEOMETRY[anim].msPerFrame;

/** Source rectangle of a frame in a sheet whose frames are `frameSize` px. */
export function frameRect(anim: Anim, facing: number, frame: number, frameSize = FRAME_SIZE): { x: number; y: number; w: number; h: number } {
  const row = ANIM_GEOMETRY[anim].rows === 1 ? 0 : facing;
  return { x: frame * frameSize, y: row * frameSize, w: frameSize, h: frameSize };
}

export function walkFrameRect(facing: number, frame: number): { x: number; y: number; w: number; h: number } {
  return frameRect('walk', facing, frame);
}

/** Walk-cycle frame (1..8) for a time, or 0 when standing still. */
export function walkFrameAt(timeMs: number, moving: boolean): number {
  if (!moving) return 0;
  return 1 + (Math.floor((timeMs / 1000) * WALK_FPS) % (WALK_FRAMES - 1));
}

/** Frame of a one-shot animation `elapsedMs` after it started; null once it has finished. */
export function actionFrameAt(anim: Anim, elapsedMs: number): number | null {
  if (elapsedMs < 0) return 0;
  const f = Math.floor(elapsedMs / ANIM_GEOMETRY[anim].msPerFrame);
  return f < ANIM_GEOMETRY[anim].frames ? f : null;
}
