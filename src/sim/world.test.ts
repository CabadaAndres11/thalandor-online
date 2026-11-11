import { defaultAppearance } from '../appearance/catalog';
import { CollisionMap } from './collision-map';
import { PLAYER_SPEED, TICK_MS, TILE_SIZE } from './constants';
import { DOWN, LEFT } from './facing';
import { World } from './world';
import type { PlayerInput } from './types';

const STEP = (PLAYER_SPEED * TICK_MS) / 1000;
const spawn = { x: 160, y: 160 };
const mk = () => new World(new CollisionMap(20, 20, new Uint8Array(400)), spawn);
const info = (name: string) => ({ name, classId: 'warrior' as const, appearance: defaultAppearance('warrior') });
const inp = (seq: number, moveX = 1, moveY = 0, aimX = 0, aimY = 0): PlayerInput => ({ seq, moveX, moveY, aimX, aimY });

test('one movement tick at the new scale is 6 px', () => {
  expect(STEP).toBe(6);
  expect(TILE_SIZE).toBe(32);
});

test('addPlayer spawns at spawn point (or a given point) with incrementing ids', () => {
  const w = mk();
  const a = w.addPlayer(info('Ana'));
  const b = w.addPlayer(info('Beto'), { x: 100, y: 120 });
  expect(a.pos).toEqual(spawn);
  expect(b.pos).toEqual({ x: 100, y: 120 });
  expect(b.id).toBe(a.id + 1);
  expect(a.lastInputSeq).toBe(0);
  expect(a.classId).toBe('warrior');
});

test('queued inputs applied in seq order, one movement tick each', () => {
  const w = mk();
  const p = w.addPlayer(info('Ana'));
  w.queueInput(p.id, inp(2));
  w.queueInput(p.id, inp(1));
  w.step();
  const s = w.snapshot().players[0]!;
  expect(s.x).toBeCloseTo(spawn.x + 2 * STEP, 6);
  expect(s.lastInputSeq).toBe(2);
  expect(w.tick).toBe(1);
});

test('stale inputs ignored', () => {
  const w = mk();
  const p = w.addPlayer(info('Ana'));
  w.queueInput(p.id, inp(1));
  w.step();
  w.queueInput(p.id, inp(1));
  w.step();
  expect(w.snapshot().players[0]!.x).toBeCloseTo(spawn.x + STEP, 6);
});

test('snapshot reflects positions, lastInputSeq, facing and moving', () => {
  const w = mk();
  const p = w.addPlayer(info('Ana'));
  w.queueInput(p.id, inp(1, 0, 1));
  w.step();
  expect(w.snapshot()).toEqual({
    tick: 1,
    players: [{ id: p.id, name: 'Ana', x: spawn.x, y: spawn.y + STEP, lastInputSeq: 1, facing: DOWN, moving: true }],
  });
});

test('moving left faces left; standing still faces the aim', () => {
  const w = mk();
  const p = w.addPlayer(info('Ana'));
  w.queueInput(p.id, inp(1, -1, 0));
  w.step();
  expect(w.snapshot().players[0]).toMatchObject({ facing: LEFT, moving: true });
  const pos = w.getPlayer(p.id)!.pos;
  w.queueInput(p.id, inp(2, 0, 0, pos.x, pos.y + 50));
  w.step();
  expect(w.snapshot().players[0]).toMatchObject({ facing: DOWN, moving: false });
});

test('moving stays true across a tick with a lost input, then turns off after a pause', () => {
  const w = mk();
  const p = w.addPlayer(info('Ana'));
  w.queueInput(p.id, inp(1));
  w.step();
  w.step(); // input lost this tick
  expect(w.snapshot().players[0]!.moving).toBe(true);
  for (let i = 0; i < 6; i++) w.step();
  expect(w.snapshot().players[0]!.moving).toBe(false);
});

test('removePlayer removes from snapshot', () => {
  const w = mk();
  const p = w.addPlayer(info('Ana'));
  w.removePlayer(p.id);
  expect(w.snapshot().players).toEqual([]);
});

test('isSpawnable false inside or touching a wall, true in open floor', () => {
  const solid = new Uint8Array(400);
  solid[5 * 20 + 5] = 1; // tile (5,5)
  const w = new World(new CollisionMap(20, 20, solid), spawn);
  expect(w.isSpawnable({ x: 5 * TILE_SIZE + 16, y: 5 * TILE_SIZE + 16 })).toBe(false);
  expect(w.isSpawnable({ x: 5 * TILE_SIZE - 4, y: 5 * TILE_SIZE + 16 })).toBe(false);
  expect(w.isSpawnable({ x: 2 * TILE_SIZE, y: 2 * TILE_SIZE })).toBe(true);
  expect(w.isSpawnable({ x: 4, y: 100 })).toBe(false);
  expect(w.isSpawnable({ x: Number.NaN, y: 100 })).toBe(false);
});
