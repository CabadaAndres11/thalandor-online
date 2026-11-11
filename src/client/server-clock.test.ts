import { ServerClock } from './server-clock';
import { TICK_MS } from '../sim/constants';

test('converges to min offset under jitter', () => {
  const clock = new ServerClock();
  const trueOffset = 1000;
  const jitter = [30, 5, 18, 0, 22, 9, 14, 3];
  for (let tick = 0; tick < 40; tick++) {
    clock.observe(tick, tick * TICK_MS + trueOffset + jitter[tick % jitter.length]!);
  }
  expect(clock.serverTimeMs(5000)).toBe(5000 - trueOffset);
});

test('forgets old observations beyond the window', () => {
  const clock = new ServerClock();
  clock.observe(0, 0); // offset 0: an outlier that must age out
  for (let tick = 1; tick <= 40; tick++) clock.observe(tick, tick * TICK_MS + 200);
  expect(clock.serverTimeMs(1000)).toBe(800);
});
