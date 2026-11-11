import { startTickLoop } from './tick-loop';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('runs 20 steps per simulated second', () => {
  let steps = 0;
  const stop = startTickLoop(() => steps++, { now: () => Date.now() });
  vi.advanceTimersByTime(1000);
  stop();
  expect(steps).toBeGreaterThanOrEqual(19);
  expect(steps).toBeLessThanOrEqual(20);
});

test('catches up missed ticks up to maxCatchUp', () => {
  let t = 0;
  let steps = 0;
  const stop = startTickLoop(() => steps++, { now: () => t, tickMs: 50, maxCatchUp: 5 });
  t = 1000;
  vi.advanceTimersByTime(50);
  expect(steps).toBe(5);
  steps = 0;
  t = 1050;
  vi.advanceTimersByTime(60);
  expect(steps).toBe(1);
  stop();
});

test('stop prevents further steps', () => {
  let steps = 0;
  const stop = startTickLoop(() => steps++, { now: () => Date.now() });
  vi.advanceTimersByTime(200);
  stop();
  const at = steps;
  vi.advanceTimersByTime(1000);
  expect(steps).toBe(at);
});
