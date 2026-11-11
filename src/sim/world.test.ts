import { CollisionMap } from './collision-map';
import { World } from './world';
import type { PlayerInput } from './types';

const spawn = { x: 80, y: 80 };
const mk = () => new World(new CollisionMap(20, 20, new Uint8Array(400)), spawn);
const inp = (seq: number, moveX = 1, moveY = 0): PlayerInput => ({ seq, moveX, moveY, aimX: 0, aimY: 0 });

test('addPlayer spawns at spawn point with incrementing ids', () => {
  const w = mk();
  const a = w.addPlayer('Ana');
  const b = w.addPlayer('Beto');
  expect(a.pos).toEqual(spawn);
  expect(b.id).toBe(a.id + 1);
  expect(a.lastInputSeq).toBe(0);
});

test('queued inputs applied in seq order, one movement tick each', () => {
  const w = mk();
  const p = w.addPlayer('Ana');
  w.queueInput(p.id, inp(2));
  w.queueInput(p.id, inp(1));
  w.step();
  const s = w.snapshot().players[0]!;
  expect(s.x).toBeCloseTo(spawn.x + 8, 6);
  expect(s.lastInputSeq).toBe(2);
  expect(w.tick).toBe(1);
});

test('stale inputs ignored', () => {
  const w = mk();
  const p = w.addPlayer('Ana');
  w.queueInput(p.id, inp(1));
  w.step();
  w.queueInput(p.id, inp(1));
  w.step();
  expect(w.snapshot().players[0]!.x).toBeCloseTo(spawn.x + 4, 6);
});

test('snapshot reflects positions and lastInputSeq', () => {
  const w = mk();
  const p = w.addPlayer('Ana');
  w.queueInput(p.id, inp(1, 0, 1));
  w.step();
  expect(w.snapshot()).toEqual({ tick: 1, players: [{ id: p.id, name: 'Ana', x: spawn.x, y: spawn.y + 4, lastInputSeq: 1 }] });
});

test('removePlayer removes from snapshot', () => {
  const w = mk();
  const p = w.addPlayer('Ana');
  w.removePlayer(p.id);
  expect(w.snapshot().players).toEqual([]);
});
