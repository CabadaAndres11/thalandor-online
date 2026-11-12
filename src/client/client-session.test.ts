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
/** A player unit as the host sends it. */
const U = (o: { id: number; name: string; x: number; y: number; facing?: number; moving?: boolean }) => ({
  kind: 'player' as const,
  type: 'warrior',
  hp: 100,
  maxHp: 100,
  state: 'alive' as const,
  lastInputSeq: 0,
  facing: 2,
  moving: false,
  ...o,
});

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
  await send({ t: 'snapshot', s: { tick: 1, units: [U({ id: 1, name: 'Ana', x: 5, y: 5 })] } });
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
  const ana = U({ id: 1, name: 'Ana', x: 50, y: 50 });
  const beto = U({ id: 2, name: 'Beto', x: 10, y: 10 });
  const look = netChar('x').appearance;
  const r1 = [
    { id: 1, name: 'Ana', classId: 'warrior' as const, appearance: look },
    { id: 2, name: 'Beto', classId: 'warrior' as const, appearance: look },
  ];
  await send({ t: 'roster', players: r1 });
  await send({ t: 'snapshot', s: { tick: 1, units: [ana, beto] } });
  await send({ t: 'roster', players: [...r1, { id: 3, name: 'Cira', classId: 'mage' as const, appearance: look }] });
  await send({ t: 'snapshot', s: { tick: 2, units: [ana, beto, U({ id: 3, name: 'Cira', x: 1, y: 1 })] } });
  expect(joined).toEqual([{ playerId: 3, name: 'Cira' }]);
  session.sendInput({ moveX: 1, moveY: 0, aimX: 0, aimY: 0 });
  await vi.runAllTimersAsync();
  expect(received.at(-1)).toEqual({ t: 'input', input: { seq: 1, moveX: 1, moveY: 0, aimX: 0, aimY: 0, buttons: 0, presses: [] } });
  clock += 1000;
  const r = session.renderState(clock);
  expect(r.self).toMatchObject({ pos: { x: 56, y: 50 }, facing: 3, moving: true });
  expect(r.others.get(2)).toMatchObject({ name: 'Beto', pos: { x: 10, y: 10 }, facing: 2, moving: false });
  expect(r.others.has(1)).toBe(false);
  await send({ t: 'left', playerId: 3, name: 'Cira' });
  await send({ t: 'chat', from: 'Beto', text: 'hola' });
  expect(left).toEqual([{ playerId: 3, name: 'Cira' }]);
  expect(chats).toEqual([{ from: 'Beto', text: 'hola' }]);
  session.sendChat('  hey ');
  await vi.runAllTimersAsync();
  expect(received.at(-1)).toEqual({ t: 'chat', text: 'hey' });
});

test('hello carries character', async () => {
  const { received } = await setup();
  expect(received[0]).toMatchObject({ t: 'hello', character: { name: 'Ana', classId: 'warrior' } });
});

test('roster event and others carry classId/appearance', async () => {
  const { session, send } = await setup();
  const rosters: unknown[] = [];
  session.on('roster', (p) => rosters.push(p));
  await send({ t: 'welcome', playerId: 1, mapId: 'test-arena' });
  const mageLook = { body: 'female', skin: 'olive', hairStyle: 'long', hairColor: 'blonde' };
  const roster = [
    { id: 1, name: 'Ana', classId: 'warrior' as const, appearance: netChar('Ana').appearance },
    { id: 2, name: 'Beto', classId: 'mage' as const, appearance: mageLook },
  ];
  await send({ t: 'roster', players: roster });
  await send({ t: 'snapshot', s: { tick: 1, units: [U({ id: 2, name: 'Beto', x: 10, y: 10, facing: 1, moving: true })] } });
  expect(rosters).toEqual([{ players: roster }]);
  expect(session.renderState(clock + 1000).others.get(2)).toMatchObject({
    name: 'Beto',
    pos: { x: 10, y: 10 },
    facing: 1,
    moving: true,
    classId: 'mage',
    appearance: mageLook,
  });
});

test('self facing follows last input: movement first, then aim when still', async () => {
  const { session, send } = await setup();
  await send({ t: 'welcome', playerId: 1, mapId: 'test-arena' });
  await send({ t: 'snapshot', s: { tick: 1, units: [U({ id: 1, name: 'Ana', x: 50, y: 50 })] } });
  session.sendInput({ moveX: 0, moveY: -1, aimX: 0, aimY: 0 });
  expect(session.renderState(clock).self).toMatchObject({ facing: 0, moving: true });
  session.sendInput({ moveX: 0, moveY: 0, aimX: 0, aimY: 44 });
  expect(session.renderState(clock).self).toMatchObject({ facing: 1, moving: false });
});

test('selfLocation returns authoritative snapshot position, not the prediction', async () => {
  const { session, send } = await setup();
  expect(session.selfLocation()).toBeNull();
  await send({ t: 'welcome', playerId: 1, mapId: 'test-arena' });
  await send({ t: 'snapshot', s: { tick: 1, units: [U({ id: 1, name: 'Ana', x: 50, y: 70 })] } });
  session.sendInput({ moveX: 1, moveY: 0, aimX: 0, aimY: 0 });
  expect(session.selfLocation()).toEqual({ x: 50, y: 70 });
});

test('presses are resent until acknowledged by the host, then dropped', async () => {
  const { session, send, received } = await setup();
  await send({ t: 'welcome', playerId: 1, mapId: 'test-arena' });
  session.press('s1', { x: 9, y: 9 });
  session.sendInput({ moveX: 0, moveY: 0, aimX: 0, aimY: 0 });
  session.sendInput({ moveX: 0, moveY: 0, aimX: 0, aimY: 0 });
  await vi.runAllTimersAsync();
  const inputs = received.filter((m) => m.t === 'input');
  expect(inputs.map((m) => (m.t === 'input' ? m.input.presses : []))).toEqual([
    [{ seq: 1, slot: 's1', aimX: 9, aimY: 9 }],
    [{ seq: 1, slot: 's1', aimX: 9, aimY: 9 }],
  ]);
  const me = { resource: 0, maxResource: 100, resourceKind: 'rage', cd: {}, gcd: 0, shield: 0, downedMs: 0, respawnMs: 0, moveSpeed: 120, canMove: true, lastPressSeq: 1, statuses: [], reviving: null, dash: null, combo: 0, channel: null };
  await send({ t: 'snapshot', s: { tick: 1, units: [U({ id: 1, name: 'Ana', x: 50, y: 50 })] }, me });
  session.sendInput({ moveX: 0, moveY: 0, aimX: 0, aimY: 0 });
  await vi.runAllTimersAsync();
  const last = received.at(-1);
  expect(last?.t === 'input' && last.input.presses).toEqual([]);
  expect(session.meState?.lastPressSeq).toBe(1);
});

test('combat events are surfaced', async () => {
  const { session, send } = await setup();
  const got: unknown[] = [];
  session.on('combat', (p) => got.push(p));
  await send({ t: 'events', list: [{ e: 'died', id: 7 }] });
  expect(got).toEqual([{ list: [{ e: 'died', id: 7 }] }]);
});

test('monsters appear among the others with their type and health', async () => {
  const { session, send } = await setup();
  await send({ t: 'welcome', playerId: 1, mapId: 'test-arena' });
  await send({
    t: 'snapshot',
    s: { tick: 1, units: [U({ id: 1, name: 'Ana', x: 0, y: 0 }), { ...U({ id: 9, name: 'skeleton', x: 30, y: 40 }), kind: 'monster', type: 'skeleton', hp: 20, maxHp: 70 }] },
  });
  expect(session.renderState(clock + 1000).others.get(9)).toMatchObject({ kind: 'monster', type: 'skeleton', hp: 20, maxHp: 70, pos: { x: 30, y: 40 } });
});
