import { netChar } from '../test-fixtures';
import { CollisionMap } from '../sim/collision-map';
import { createMemoryNetwork } from '../net/memory-transport';
import { decodeClient, encode, type ClientMessage, type HostMessage } from '../net/protocol';
import type { Connection } from '../net/transport';
import { ClientSession, SNAPSHOT_TIMEOUT_MS } from './client-session';

let clock = 0;
beforeEach(() => {
  vi.useFakeTimers();
  clock = 0;
});
afterEach(() => vi.useRealTimers());

const map = new CollisionMap(30, 30, new Uint8Array(900));

async function setup() {
  const net = createMemoryNetwork();
  const host = net.createHost('ABC234');
  let hostSide!: Connection;
  const received: ClientMessage[] = [];
  host.onConnection((c) => {
    hostSide = c;
    c.onMessage((d) => received.push(decodeClient(d)!));
  });
  const p = net.createClient().connect('ABC234');
  await vi.runAllTimersAsync();
  const session = new ClientSession(await p, { version: '0.1.0', character: netChar('Ana'), map, now: () => clock });
  await vi.runAllTimersAsync();
  const send = async (m: HostMessage) => {
    hostSide.send(encode(m), 'reliable');
    await vi.runAllTimersAsync();
  };
  return { session, hostSide, received, send };
}

test('sends hello on start', async () => {
  const { received } = await setup();
  expect(received[0]).toEqual({ t: 'hello', version: '0.1.0', character: netChar('Ana') });
});

test('emits welcome and sets playerId', async () => {
  const { session, send } = await setup();
  const got: unknown[] = [];
  session.on('welcome', (p) => got.push(p));
  await send({ t: 'welcome', playerId: 3, mapId: 'test-arena' });
  expect(session.playerId).toBe(3);
  expect(got).toEqual([{ playerId: 3, mapId: 'test-arena' }]);
});

test('emits rejected with reason', async () => {
  const { session, send, hostSide } = await setup();
  const got: unknown[] = [];
  let disconnected = 0;
  session.on('rejected', (p) => got.push(p));
  session.on('disconnected', () => disconnected++);
  await send({ t: 'reject', reason: 'full' });
  hostSide.close();
  await vi.runAllTimersAsync();
  expect(got).toEqual([{ reason: 'full' }]);
  expect(disconnected).toBe(0);
});

test('emits disconnected when no snapshot for 5s', async () => {
  const { session, send } = await setup();
  let disconnected = 0;
  session.on('disconnected', () => disconnected++);
  await send({ t: 'welcome', playerId: 1, mapId: 'test-arena' });
  clock = 1000;
  await send({ t: 'snapshot', s: { tick: 1, players: [{ id: 1, name: 'Ana', x: 5, y: 5, lastInputSeq: 0, facing: 2, moving: false }] } });
  session.checkTimeout(1000 + SNAPSHOT_TIMEOUT_MS - 1);
  expect(disconnected).toBe(0);
  session.checkTimeout(1000 + SNAPSHOT_TIMEOUT_MS + 1);
  session.checkTimeout(1000 + SNAPSHOT_TIMEOUT_MS + 2000);
  expect(disconnected).toBe(1);
});

test('emits disconnected on close', async () => {
  const { session, hostSide } = await setup();
  let disconnected = 0;
  session.on('disconnected', () => disconnected++);
  hostSide.close();
  await vi.runAllTimersAsync();
  expect(disconnected).toBe(1);
});

test('renders self from prediction and others from snapshots; emits joined, left and chat', async () => {
  const { session, send, received } = await setup();
  const joined: unknown[] = [];
  const left: unknown[] = [];
  const chats: unknown[] = [];
  session.on('joined', (p) => joined.push(p));
  session.on('left', (p) => left.push(p));
  session.on('chat', (p) => chats.push(p));
  await send({ t: 'welcome', playerId: 1, mapId: 'test-arena' });
  const ana = { id: 1, name: 'Ana', x: 50, y: 50, lastInputSeq: 0, facing: 2, moving: false };
  const beto = { id: 2, name: 'Beto', x: 10, y: 10, lastInputSeq: 0, facing: 2, moving: false };
  await send({ t: 'snapshot', s: { tick: 1, players: [ana, beto] } });
  await send({ t: 'snapshot', s: { tick: 2, players: [ana, beto, { id: 3, name: 'Cira', x: 1, y: 1, lastInputSeq: 0, facing: 2, moving: false }] } });
  expect(joined).toEqual([{ playerId: 3, name: 'Cira' }]);
  session.sendInput({ moveX: 1, moveY: 0, aimX: 0, aimY: 0 });
  await vi.runAllTimersAsync();
  expect(received.at(-1)).toEqual({ t: 'input', input: { seq: 1, moveX: 1, moveY: 0, aimX: 0, aimY: 0 } });
  clock += 1000;
  const r = session.renderState(clock);
  expect(r.self).toEqual({ x: 56, y: 50 });
  expect(r.others.get(2)).toEqual({ name: 'Beto', pos: { x: 10, y: 10 } });
  expect(r.others.has(1)).toBe(false);
  await send({ t: 'left', playerId: 3, name: 'Cira' });
  await send({ t: 'chat', from: 'Beto', text: 'hola' });
  expect(left).toEqual([{ playerId: 3, name: 'Cira' }]);
  expect(chats).toEqual([{ from: 'Beto', text: 'hola' }]);
  session.sendChat('  hey ');
  await vi.runAllTimersAsync();
  expect(received.at(-1)).toEqual({ t: 'chat', text: 'hey' });
});
