import { TICK_MS } from '../sim/constants';
import type { WorldSnapshot } from '../sim/world';
import { SnapshotBuffer } from './interpolation';

const snap = (tick: number, players: [number, number, number][]): WorldSnapshot => ({
  tick,
  players: players.map(([id, x, y]) => ({ id, name: `p${id}`, x, y, lastInputSeq: 0, facing: 2, moving: false })),
});

test('interpolates halfway between ticks', () => {
  const b = new SnapshotBuffer();
  b.push(snap(10, [[1, 0, 0]]));
  b.push(snap(11, [[1, 10, 20]]));
  expect(b.sample(10.5 * TICK_MS).get(1)).toEqual({ x: 5, y: 10 });
});

test('handles out-of-order snapshots', () => {
  const b = new SnapshotBuffer();
  b.push(snap(11, [[1, 10, 0]]));
  b.push(snap(10, [[1, 0, 0]]));
  b.push(snap(10, [[1, 999, 0]])); // duplicate tick is ignored
  expect(b.sample(10.5 * TICK_MS).get(1)).toEqual({ x: 5, y: 0 });
});

test('holds last position beyond newest snapshot', () => {
  const b = new SnapshotBuffer();
  b.push(snap(10, [[1, 0, 0]]));
  b.push(snap(11, [[1, 10, 0]]));
  expect(b.sample(50 * TICK_MS).get(1)).toEqual({ x: 10, y: 0 });
  expect(b.sample(0).get(1)).toEqual({ x: 0, y: 0 });
});

test('entity absent in newer snapshot is dropped', () => {
  const b = new SnapshotBuffer();
  b.push(snap(10, [[1, 0, 0], [2, 5, 5]]));
  b.push(snap(11, [[1, 10, 0], [3, 7, 7]]));
  const s = b.sample(10.5 * TICK_MS);
  expect(s.has(2)).toBe(false);
  expect(s.get(3)).toEqual({ x: 7, y: 7 });
});

test('keeps at most one second of snapshots', () => {
  const b = new SnapshotBuffer();
  for (let t = 0; t < 100; t++) b.push(snap(t, [[1, t, 0]]));
  expect(b.size).toBeLessThanOrEqual(21);
});
