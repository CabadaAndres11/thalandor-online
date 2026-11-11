import { TICK_MS } from '../sim/constants';

const WINDOW = 40;

/**
 * Estimates host simulation time from snapshot arrivals. The smallest observed
 * (arrival - tick time) is the least-delayed packet, so it is the best offset estimate.
 */
export class ServerClock {
  private readonly offsets: number[] = [];
  private offset = 0;

  observe(tick: number, receivedAtMs: number): void {
    this.offsets.push(receivedAtMs - tick * TICK_MS);
    if (this.offsets.length > WINDOW) this.offsets.shift();
    this.offset = Math.min(...this.offsets);
  }

  serverTimeMs(localMs: number): number {
    return localMs - this.offset;
  }
}
