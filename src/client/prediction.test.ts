import { CollisionMap } from '../sim/collision-map';
import { stepPlayerMovement } from '../sim/movement';
import type { PlayerInput } from '../sim/types';
import { Predictor } from './prediction';

const map = new CollisionMap(30, 30, new Uint8Array(900));
const inp = (seq: number, moveX = 1, moveY = 0): PlayerInput => ({ seq, moveX, moveY, aimX: 0, aimY: 0 });

test('applyLocal moves immediately', () => {
  const p = new Predictor(map);
  p.reconcile({ x: 100, y: 100 }, 0);
  p.applyLocal(inp(1));
  expect(p.pos).toEqual({ x: 106, y: 100 });
});

test('reconcile replays unacked inputs', () => {
  const p = new Predictor(map);
  p.reconcile({ x: 100, y: 100 }, 0);
  const inputs = [inp(1), inp(2, 0, 1), inp(3, 1, 1), inp(4, -1, 0), inp(5, 0, -1)];
  for (const i of inputs) p.applyLocal(i);
  const server = { x: 103, y: 102 };
  p.reconcile(server, 2);
  let expected = server;
  for (const i of inputs.slice(2)) expected = stepPlayerMovement(expected, i, map);
  expect(p.pos.x).toBeCloseTo(expected.x, 9);
  expect(p.pos.y).toBeCloseTo(expected.y, 9);
  p.reconcile(server, 5);
  expect(p.pos).toEqual(server);
});

test('dodge is predicted: 96 px over three inputs, ignoring move input', () => {
  const p = new Predictor(map);
  p.reconcile({ x: 100, y: 100 }, 0);
  p.applyLocal(inp(1, 0, 0), { x: 1, y: 0 });
  p.applyLocal(inp(2, 0, 1));
  p.applyLocal(inp(3, 0, 1));
  expect(p.pos.x).toBeCloseTo(196, 6);
  expect(p.pos.y).toBeCloseTo(100, 6);
  p.applyLocal(inp(4, 0, 1));
  expect(p.pos.y).toBeCloseTo(106, 6);
});

test('reconcile resumes a dash the server reports in progress', () => {
  const p = new Predictor(map);
  p.reconcile({ x: 100, y: 100 }, 0);
  p.applyLocal(inp(1, 0, 0), { x: 1, y: 0 });
  p.applyLocal(inp(2, 0, 0));
  // Server applied input 1 only; one dash tick of 32 px left after input 2 is replayed? No: server says 2 ticks left after input 1.
  p.reconcile({ x: 132, y: 100 }, 1, { dx: 32, dy: 0, ticks: 2 });
  expect(p.pos.x).toBeCloseTo(164, 6);
});

test('speed and inability to move are respected', () => {
  const p = new Predictor(map);
  p.reconcile({ x: 100, y: 100 }, 0);
  p.setMotion(60, true);
  p.applyLocal(inp(1));
  expect(p.pos.x).toBeCloseTo(103, 6);
  p.setMotion(60, false);
  p.applyLocal(inp(2));
  expect(p.pos.x).toBeCloseTo(103, 6);
});
