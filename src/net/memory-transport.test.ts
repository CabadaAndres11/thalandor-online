import { createMemoryNetwork } from './memory-transport';
import { TransportError, type Connection } from './transport';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

async function pair(opts?: Parameters<typeof createMemoryNetwork>[0]) {
  const net = createMemoryNetwork(opts);
  const host = net.createHost('ABC234');
  let hostSide: Connection | undefined;
  host.onConnection((c) => (hostSide = c));
  const p = net.createClient().connect('ABC234');
  await vi.runAllTimersAsync();
  const client = await p;
  return { client, hostSide: hostSide!, host };
}

test('delivers reliable messages in order after latency', async () => {
  const { client, hostSide } = await pair({ latencyMs: 100 });
  const got: string[] = [];
  hostSide.onMessage((d) => got.push(d));
  client.send('a', 'reliable');
  client.send('b', 'reliable');
  await vi.advanceTimersByTimeAsync(99);
  expect(got).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(got).toEqual(['a', 'b']);
});

test('unreliable messages dropped at lossRate with seeded rng', async () => {
  const { client, hostSide } = await pair({ lossRate: 0.5, rng: seq([0.1, 0.9, 0.4, 0.6]) });
  const got: string[] = [];
  hostSide.onMessage((d) => got.push(d));
  for (const m of ['1', '2', '3', '4']) client.send(m, 'unreliable');
  await vi.runAllTimersAsync();
  expect(got).toEqual(['2', '4']);
});

test('reliable never dropped even with lossRate 1', async () => {
  const { client, hostSide } = await pair({ lossRate: 1 });
  const got: string[] = [];
  hostSide.onMessage((d) => got.push(d));
  client.send('x', 'reliable');
  client.send('y', 'unreliable');
  await vi.runAllTimersAsync();
  expect(got).toEqual(['x']);
});

test('connect to unknown code rejects with room-not-found', async () => {
  const net = createMemoryNetwork();
  const p = net.createClient().connect('ZZZZZZ');
  const assertion = expect(p).rejects.toMatchObject({ kind: 'room-not-found' });
  await vi.runAllTimersAsync();
  await assertion;
  await expect(p).rejects.toBeInstanceOf(TransportError);
});

test('close propagates to peer', async () => {
  const { client, hostSide } = await pair({ latencyMs: 20 });
  let closed = 0;
  hostSide.onClose(() => closed++);
  client.close();
  await vi.runAllTimersAsync();
  expect(closed).toBe(1);
  const got: string[] = [];
  hostSide.onMessage((d) => got.push(d));
  client.send('late', 'reliable');
  await vi.runAllTimersAsync();
  expect(got).toEqual([]);
});

test('host close closes all connections', async () => {
  const { client, host } = await pair();
  let closed = false;
  client.onClose(() => (closed = true));
  host.close();
  await vi.runAllTimersAsync();
  expect(closed).toBe(true);
});
