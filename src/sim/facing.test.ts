import { DOWN, facingFromVector, LEFT, RIGHT, UP } from './facing';

test('facing values follow LPC walk rows: up, left, down, right', () => {
  expect([UP, LEFT, DOWN, RIGHT]).toEqual([0, 1, 2, 3]);
});

test('axis cases', () => {
  expect(facingFromVector(0, -1, DOWN)).toBe(UP);
  expect(facingFromVector(0, 1, UP)).toBe(DOWN);
  expect(facingFromVector(-1, 0, UP)).toBe(LEFT);
  expect(facingFromVector(1, 0, UP)).toBe(RIGHT);
  expect(facingFromVector(2, -5, LEFT)).toBe(UP);
});

test('tie goes horizontal', () => {
  expect(facingFromVector(1, 1, UP)).toBe(RIGHT);
  expect(facingFromVector(-3, 3, UP)).toBe(LEFT);
});

test('zero keeps prev', () => {
  expect(facingFromVector(0, 0, LEFT)).toBe(LEFT);
});
