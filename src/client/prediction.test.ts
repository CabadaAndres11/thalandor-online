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
