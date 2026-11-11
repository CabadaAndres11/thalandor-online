import { TICK_MS } from '../sim/constants';

export interface TickLoopOptions {
  tickMs?: number;
  now?: () => number;
  /** Max steps per wake-up; older backlog is dropped so a stalled host does not spiral. */
  maxCatchUp?: number;
}

/** Fixed-timestep loop driven by setTimeout. Returns a stop function. */
export function startTickLoop(step: () => void, opts: TickLoopOptions = {}): () => void {
  const tickMs = opts.tickMs ?? TICK_MS;
  const now = opts.now ?? (() => performance.now());
  const maxCatchUp = opts.maxCatchUp ?? 5;
  let next = now() + tickMs;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const wake = () => {
    if (stopped) return;
    const t = now();
    let ran = 0;
    while (t >= next && ran < maxCatchUp) {
      step();
      next += tickMs;
      ran++;
    }
    if (t >= next) next = t + tickMs;
    timer = setTimeout(wake, Math.max(0, next - now()));
  };

  timer = setTimeout(wake, tickMs);
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
