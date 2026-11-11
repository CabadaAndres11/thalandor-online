import { inputFromKeys } from './input';

const keys = (k: Partial<{ up: boolean; down: boolean; left: boolean; right: boolean }>) => ({
  up: false,
  down: false,
  left: false,
  right: false,
  ...k,
});

test('opposite keys cancel', () => {
  expect(inputFromKeys(keys({ left: true, right: true, up: true, down: true }), { x: 0, y: 0 })).toMatchObject({ moveX: 0, moveY: 0 });
});

test('maps wasd to unit axes', () => {
  expect(inputFromKeys(keys({ right: true, up: true }), { x: 0, y: 0 })).toMatchObject({ moveX: 1, moveY: -1 });
  expect(inputFromKeys(keys({ left: true, down: true }), { x: 0, y: 0 })).toMatchObject({ moveX: -1, moveY: 1 });
});

test('passes aim through', () => {
  expect(inputFromKeys(keys({}), { x: 12.5, y: -3 })).toEqual({ moveX: 0, moveY: 0, aimX: 12.5, aimY: -3 });
});
