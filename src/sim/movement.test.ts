import { CollisionMap } from './collision-map';
import { moveCircle, stepPlayerMovement } from './movement';
import { PLAYER_RADIUS, PLAYER_SPEED, TICK_MS, TILE_SIZE } from './constants';
import type { PlayerInput } from './types';

const input = (moveX: number, moveY: number): PlayerInput => ({ seq: 1, moveX, moveY, aimX: 0, aimY: 0 });

function openMap(w = 10, h = 10): CollisionMap {
  return new CollisionMap(w, h, new Uint8Array(w * h));
}

function mapWithWallColumn(col: number, w = 10, h = 10): CollisionMap {
  const solid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) solid[y * w + col] = 1;
  return new CollisionMap(w, h, solid);
}

test('diagonal speed is normalized', () => {
  const start = { x: 80, y: 80 };
  const end = stepPlayerMovement(start, input(1, 1), openMap());
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  expect(dist).toBeCloseTo((PLAYER_SPEED * TICK_MS) / 1000, 6);
  expect((PLAYER_SPEED * TICK_MS) / 1000).toBe(4);
});

test('cannot enter solid tile', () => {
  const map = mapWithWallColumn(5);
  let pos = { x: 40, y: 80 };
  for (let i = 0; i < 20; i++) {
    pos = stepPlayerMovement(pos, input(1, 0), map);
    expect(pos.x + PLAYER_RADIUS).toBeLessThanOrEqual(5 * TILE_SIZE + 1e-9);
  }
  expect(pos.x + PLAYER_RADIUS).toBeCloseTo(5 * TILE_SIZE, 6);
});

test('slides along wall', () => {
  const map = mapWithWallColumn(5);
  let pos = { x: 5 * TILE_SIZE - PLAYER_RADIUS, y: 40 };
  const before = { ...pos };
  pos = stepPlayerMovement(pos, input(1, 1), map);
  expect(pos.x).toBeCloseTo(before.x, 6);
  expect(pos.y).toBeGreaterThan(before.y);
});

test('zero input does not move', () => {
  const pos = { x: 50, y: 50 };
  expect(stepPlayerMovement(pos, input(0, 0), openMap())).toEqual(pos);
});

test('moveCircle stops at wall on the left too', () => {
  const map = mapWithWallColumn(2);
  const end = moveCircle({ x: 3 * TILE_SIZE + PLAYER_RADIUS + 1, y: 40 }, PLAYER_RADIUS, -10, 0, map);
  expect(end.x - PLAYER_RADIUS).toBeCloseTo(3 * TILE_SIZE, 6);
});
