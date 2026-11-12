import { netChar } from '../test-fixtures';
import arena from '../../data/maps/test-arena.json';
import type { TiledMap } from '../sim/collision-map';
import { CollisionMap } from '../sim/collision-map';
import { ClientSession } from '../client/client-session';
import { createMemoryNetwork } from '../net/memory-transport';
import { createWorkerHandler } from './host.worker';
import { startWorkerHost, type WorkerLike } from './worker-host';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const mapJson = arena as unknown as TiledMap;
const map = CollisionMap.fromTiled(mapJson);

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  terminated = false;
  private readonly handle = createWorkerHandler((m) => queueMicrotask(() => this.onmessage?.({ data: m })), { now: () => Date.now() });
  postMessage(m: unknown): void {
    if (!this.terminated) queueMicrotask(() => this.handle(m as never));
  }
  terminate(): void {
    this.terminated = true;
    this.handle({ k: 'stop' });
  }
}

function start() {
  const worker = new FakeWorker();
  const handle = startWorkerHost({ version: '0.1.0', mapId: 'test-arena', mapJson, defaultName: 'Aventurero', workerFactory: () => worker });
  return { worker, handle };
}

test('local client joins through worker and receives snapshots', async () => {
  const { handle } = start();
  const client = new ClientSession(handle.connectLocal(), { version: '0.1.0', character: netChar('Host'), map, now: () => Date.now() });
  await vi.advanceTimersByTimeAsync(300);
  expect(client.playerId).toBe(1);
  expect(client.renderState(Date.now()).self).not.toBeNull();
  handle.stop();
});

test('remote connection via memory HostTransport is relayed', async () => {
  const { handle } = start();
  const local = new ClientSession(handle.connectLocal(), { version: '0.1.0', character: netChar('Host'), map, now: () => Date.now() });
  const net = createMemoryNetwork({ latencyMs: 20 });
  handle.addTransport(net.createHost('ABC234'));
  const p = net.createClient().connect('ABC234');
  await vi.advanceTimersByTimeAsync(50);
  const remote = new ClientSession(await p, { version: '0.1.0', character: netChar('Amigo'), map, now: () => Date.now() });
  await vi.advanceTimersByTimeAsync(500);
  expect(remote.playerId).not.toBeNull();
  expect(local.renderState(Date.now()).others.get(remote.playerId!)?.name).toBe('Amigo');
  expect(remote.renderState(Date.now()).others.get(1)?.name).toBe('Host');
  handle.stop();
});

test('local player survives long silence (throttled background tab)', async () => {
  const { handle } = start();
  const client = new ClientSession(handle.connectLocal(), { version: '0.1.0', character: netChar('Host'), map, now: () => Date.now() });
  let disconnected = false;
  client.on('disconnected', () => (disconnected = true));
  await vi.advanceTimersByTimeAsync(10_000); // no inputs at all for 10 s
  expect(disconnected).toBe(false);
  expect(client.playerId).toBe(1);
  handle.stop();
});

test('stop terminates worker and closes connections', async () => {
  const { handle, worker } = start();
  const net = createMemoryNetwork();
  handle.addTransport(net.createHost('ABC234'));
  const p = net.createClient().connect('ABC234');
  await vi.advanceTimersByTimeAsync(10);
  const remote = new ClientSession(await p, { version: '0.1.0', character: netChar('Amigo'), map, now: () => Date.now() });
  let disconnected = false;
  remote.on('disconnected', () => (disconnected = true));
  await vi.advanceTimersByTimeAsync(200);
  handle.stop();
  await vi.advanceTimersByTimeAsync(50);
  expect(worker.terminated).toBe(true);
  expect(disconnected).toBe(true);
});
