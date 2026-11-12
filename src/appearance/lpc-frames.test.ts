import { actionFrameAt, animDurationMs, FRAME_SIZE, frameRect, WALK_FRAMES, walkFrameRect } from './lpc-frames';

test('walk sheets are 9 frames of 64px per row, one row per facing', () => {
  expect(FRAME_SIZE).toBe(64);
  expect(WALK_FRAMES).toBe(9);
  expect(walkFrameRect(2, 0)).toEqual({ x: 0, y: 128, w: 64, h: 64 });
  expect(walkFrameRect(3, 8)).toEqual({ x: 512, y: 192, w: 64, h: 64 });
  expect(walkFrameRect(0, 1)).toEqual({ x: 64, y: 0, w: 64, h: 64 });
});

test('action animation geometry and timing', () => {
  expect(frameRect('slash', 3, 5)).toEqual({ x: 320, y: 192, w: 64, h: 64 });
  expect(frameRect('slash', 1, 2, 128)).toEqual({ x: 256, y: 128, w: 128, h: 128 });
  expect(frameRect('hurt', 3, 4)).toEqual({ x: 256, y: 0, w: 64, h: 64 });
  expect(actionFrameAt('slash', 0)).toBe(0);
  expect(actionFrameAt('slash', animDurationMs('slash') - 1)).toBe(5);
  expect(actionFrameAt('slash', animDurationMs('slash'))).toBeNull();
});
