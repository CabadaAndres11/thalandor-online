import { FRAME_SIZE, WALK_FRAMES, walkFrameRect } from './lpc-frames';

test('walk sheets are 9 frames of 64px per row, one row per facing', () => {
  expect(FRAME_SIZE).toBe(64);
  expect(WALK_FRAMES).toBe(9);
  expect(walkFrameRect(2, 0)).toEqual({ x: 0, y: 128, w: 64, h: 64 });
  expect(walkFrameRect(3, 8)).toEqual({ x: 512, y: 192, w: 64, h: 64 });
  expect(walkFrameRect(0, 1)).toEqual({ x: 64, y: 0, w: 64, h: 64 });
});
