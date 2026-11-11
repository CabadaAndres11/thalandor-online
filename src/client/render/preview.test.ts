import { WALK_FPS } from '../../appearance/lpc-frames';
import { previewFrame } from './preview';

test('previewFrame cycles frames 1..8 at WALK_FPS and keeps facing', () => {
  const frameMs = 1000 / WALK_FPS;
  expect(previewFrame(0, 2)).toEqual({ facing: 2, frame: 1 });
  expect(previewFrame(frameMs * 3 + 1, 2)).toEqual({ facing: 2, frame: 4 });
  expect(previewFrame(frameMs * 8 + 1, 3)).toEqual({ facing: 3, frame: 1 });
});
