import { defaultAppearance } from '../appearance/catalog';
import { netChar } from '../test-fixtures';
import { CollisionMap } from '../sim/collision-map';
import { World } from '../sim/world';
import { createMemoryNetwork } from '../net/memory-transport';
import { decodeHost, encode, type ClientMessage, type HostMessage } from '../net/protocol';
import type { Connection } from '../net/transport';
import { CONN_TIMEOUT_MS, HostSession, MAX_CHAT_LENGTH } from './host-session';

let clock = 0;
beforeEach(() => {
  vi.useFakeTimers();
  clock = 0;
});
afterEach(() => vi.useRealTimers());

function setup() {
  const world = new World(new CollisionMap(20, 20, new Uint8Array(400)), { x: 80, y: 80 });
  const session = new HostSession(world, { version: '0.1.0', mapId: 'test-arena', defaultName: 'Aventurero', now: () => clock });
  const net = createMemoryNetwork();
  const host = net.createHost('ABC234');
  host.onConnection((c) => session.attach(c));
  return { world, session, net };
}

interface TestClient {
  conn: Connection;
  msgs: HostMessage[];
  closed: boolean;
  send(m: ClientMessage): void;
}

async function join(
  net: ReturnType<typeof createMemoryNetwork>,
  hello?: Partial<{ version: string; name: string; character: Record<string, unknown> }>,
): Promise<TestClient> {
  const p = net.createClient().connect('ABC234');
  await vi.runAllTimersAsync();
  const conn = await p;
  const c: TestClient = { conn, msgs: [], closed: false, send: (m) => conn.send(encode(m), 'reliable') };
  conn.onMessage((d) => c.msgs.push(decodeHost(d)!));
  conn.onClose(() => (c.closed = true));
  const character = { ...netChar('Ana'), ...(hello?.name !== undefined ? { name: hello.name } : {}), ...(hello?.character ?? {}) };
  conn.send(JSON.stringify({ t: 'hello', version: hello?.version ?? '0.1.0', character }), 'reliable');
  await vi.runAllTimersAsync();
  return c;
}

const ofType = <T extends HostMessage['t']>(c: TestClient, t: T) => c.msgs.filter((m): m is Extract<HostMessage, { t: T }> => m.t === t);

test('welcomes a matching version', async () => {
  const { net, session } = setup();
  const c = await join(net);
  expect(ofType(c, 'welcome')).toEqual([{ t: 'welcome', playerId: 1, mapId: 'test-arena' }]);
  expect(session.playerCount).toBe(1);
});

test('rejects version mismatch with reason version', async () => {
  const { net, session } = setup();
  const c = await join(net, { version: '9.9.9' });
  expect(ofType(c, 'reject')).toEqual([{ t: 'reject', reason: 'version' }]);
  expect(c.closed).toBe(true);
  expect(session.playerCount).toBe(0);
});

test('rejects 5th player with reason full', async () => {
  const { net, session } = setup();
  for (let i = 0; i < 4; i++) await join(net, { name: `P${i}` });
  const fifth = await join(net, { name: 'P5' });
  expect(ofType(fifth, 'reject')).toEqual([{ t: 'reject', reason: 'full' }]);
  expect(fifth.closed).toBe(true);
  expect(session.playerCount).toBe(4);
});

test('ignores messages before hello', async () => {
  const { net, session, world } = setup();
  const p = net.createClient().connect('ABC234');
  await vi.runAllTimersAsync();
  const conn = await p;
  conn.send(encode({ t: 'input', input: { seq: 1, moveX: 1, moveY: 0, aimX: 0, aimY: 0 } }), 'reliable');
  conn.send(encode({ t: 'chat', text: 'hola' }), 'reliable');
  conn.send('garbage', 'reliable');
  await vi.runAllTimersAsync();
  session.tick();
  expect(session.playerCount).toBe(0);
  expect(world.snapshot().units).toEqual([]);
});

test('sanitizes input', async () => {
  const { net, session } = setup();
  const c = await join(net);
  c.send({ t: 'input', input: { seq: 1, moveX: 5, moveY: Number.NaN, aimX: Number.NaN, aimY: 3 } });
  // JSON turns NaN into null; also send an explicit non-finite via raw JSON
  c.conn.send('{"t":"input","input":{"seq":2,"moveX":1,"moveY":1e999,"aimX":1,"aimY":1}}', 'reliable');
  await vi.runAllTimersAsync();
  session.tick();
  await vi.runAllTimersAsync();
  const snap = ofType(c, 'snapshot').at(-1)!.s.units[0]!;
  expect(Number.isFinite(snap.x) && Number.isFinite(snap.y)).toBe(true);
  expect(snap.x).toBeCloseTo(80 + 6, 6);
  expect(snap.y).toBeCloseTo(80, 6);
});

test('broadcasts snapshot each tick with lastInputSeq', async () => {
  const { net, session } = setup();
  const a = await join(net, { name: 'Ana' });
  const b = await join(net, { name: 'Beto' });
  a.send({ t: 'input', input: { seq: 7, moveX: 1, moveY: 0, aimX: 0, aimY: 0 } });
  await vi.runAllTimersAsync();
  session.tick();
  session.tick();
  await vi.runAllTimersAsync();
  expect(ofType(a, 'snapshot')).toHaveLength(2);
  const last = ofType(b, 'snapshot').at(-1)!.s;
  expect(last.tick).toBe(2);
  expect(last.units.find((p) => p.name === 'Ana')!.lastInputSeq).toBe(7);
});

test('chat is trimmed and empty messages ignored', async () => {
  const { net } = setup();
  const a = await join(net, { name: 'Ana' });
  const b = await join(net, { name: 'Beto' });
  a.send({ t: 'chat', text: '   ' });
  a.send({ t: 'chat', text: `  ${'x'.repeat(500)}  ` });
  a.send({ t: 'chat', text: '<b>hola</b>' });
  await vi.runAllTimersAsync();
  const chats = ofType(b, 'chat');
  expect(chats).toHaveLength(2);
  expect(chats[0]!.text).toHaveLength(MAX_CHAT_LENGTH);
  expect(chats[0]!.from).toBe('Ana');
  expect(chats[1]!.text).toBe('<b>hola</b>');
  expect(ofType(a, 'chat')).toHaveLength(2);
});

test('names are trimmed to 16 chars and default when empty', async () => {
  const { net, world } = setup();
  await join(net, { name: '   ' });
  await join(net, { name: 'x'.repeat(30) });
  const names = world.snapshot().units.map((p) => p.name);
  expect(names).toEqual(['Aventurero', 'x'.repeat(16)]);
});

test('broadcasts left on close', async () => {
  const { net, session } = setup();
  const a = await join(net, { name: 'Ana' });
  const b = await join(net, { name: 'Beto' });
  a.conn.close();
  await vi.runAllTimersAsync();
  expect(ofType(b, 'left')).toEqual([{ t: 'left', playerId: 1, name: 'Ana' }]);
  expect(session.playerCount).toBe(1);
});

test('drops silent connection after timeout', async () => {
  const { net, session } = setup();
  const a = await join(net, { name: 'Ana' });
  const b = await join(net, { name: 'Beto' });
  clock = CONN_TIMEOUT_MS - 1000;
  b.send({ t: 'input', input: { seq: 1, moveX: 0, moveY: 0, aimX: 0, aimY: 0 } });
  await vi.runAllTimersAsync();
  clock = CONN_TIMEOUT_MS + 100;
  session.tick();
  await vi.runAllTimersAsync();
  expect(a.closed).toBe(true);
  expect(ofType(b, 'left')).toEqual([{ t: 'left', playerId: 1, name: 'Ana' }]);
  expect(session.playerCount).toBe(1);
});

test('local connection is exempt from the silence timeout', async () => {
  const { session } = setup();
  const net = createMemoryNetwork();
  const host = net.createHost('LOCAL1');
  host.onConnection((c) => session.attach(c, { noTimeout: true }));
  const p = net.createClient().connect('LOCAL1');
  await vi.runAllTimersAsync();
  const conn = await p;
  let closed = false;
  conn.onClose(() => (closed = true));
  conn.send(encode({ t: 'hello', version: '0.1.0', character: netChar('Host') }), 'reliable');
  await vi.runAllTimersAsync();
  clock = 10 * 60 * 1000; // 10 minutes of silence (background tab, throttled timers)
  session.tick();
  await vi.runAllTimersAsync();
  expect(closed).toBe(false);
  expect(session.playerCount).toBe(1);
});

test('invalid classId and appearance are replaced by defaults', async () => {
  const { net } = setup();
  const c = await join(net, { character: { classId: 'bard', appearance: { body: 'dragon', skin: 'x', hairStyle: 'y', hairColor: 'z' } } });
  const roster = ofType(c, 'roster').at(-1)!;
  expect(roster.players[0]).toEqual({ id: 1, name: 'Ana', classId: 'warrior', appearance: defaultAppearance('warrior') });
});

test('roster broadcast on join and on leave', async () => {
  const { net } = setup();
  const a = await join(net, { name: 'Ana', character: { classId: 'mage' } });
  const b = await join(net, { name: 'Beto', character: { classId: 'cleric' } });
  expect(ofType(a, 'roster').at(-1)!.players.map((p) => [p.name, p.classId])).toEqual([
    ['Ana', 'mage'],
    ['Beto', 'cleric'],
  ]);
  expect(ofType(b, 'roster').at(-1)!.players).toHaveLength(2);
  b.conn.close();
  await vi.runAllTimersAsync();
  expect(ofType(a, 'roster').at(-1)!.players.map((p) => p.name)).toEqual(['Ana']);
});

test('spawns at saved location when valid', async () => {
  const { net, world } = setup();
  await join(net, { character: { lastLocation: { mapId: 'test-arena', x: 300, y: 200 } } });
  expect(world.getPlayer(1)!.pos).toEqual({ x: 300, y: 200 });
});

test('spawns at map spawn when saved location is solid or other map', async () => {
  const solid = new Uint8Array(400);
  solid[6 * 20 + 9] = 1; // tile (9,6) covers x 288..320, y 192..224
  const world = new World(new CollisionMap(20, 20, solid), { x: 80, y: 80 });
  const session = new HostSession(world, { version: '0.1.0', mapId: 'test-arena', defaultName: 'Aventurero', now: () => clock });
  const net = createMemoryNetwork();
  net.createHost('ABC234').onConnection((c) => session.attach(c));
  await join(net, { character: { lastLocation: { mapId: 'test-arena', x: 300, y: 200 } } });
  await join(net, { name: 'Beto', character: { lastLocation: { mapId: 'other-map', x: 300, y: 300 } } });
  expect(world.getPlayer(1)!.pos).toEqual({ x: 80, y: 80 });
  expect(world.getPlayer(2)!.pos).toEqual({ x: 80, y: 80 });
});

test('each player gets its private me block and combat events reliably', async () => {
  const { net, session, world } = setup();
  const a = await join(net, { name: 'Ana', character: { classId: 'warrior' } });
  const mob = world.addMonster('skeleton', { x: 120, y: 80 });
  world.damage(mob, 5, world.getPlayer(1)!, 'physical');
  session.tick();
  await vi.runAllTimersAsync();
  const snap = ofType(a, 'snapshot').at(-1)!;
  expect(snap.me?.resourceKind).toBe('rage');
  expect(snap.s.units.some((u) => u.kind === 'monster')).toBe(true);
  expect(ofType(a, 'events').flatMap((m) => m.list).some((e) => e.e === 'hit')).toBe(true);
});

test('presses are sanitized: bad aim replaced, buttons clamped', async () => {
  const { net, session, world } = setup();
  const c = await join(net);
  // Raw text: JSON.stringify would turn the infinite aim into null.
  c.conn.send('{"t":"input","input":{"seq":1,"moveX":0,"moveY":0,"aimX":0,"aimY":0,"buttons":99999,"presses":[{"seq":1,"slot":"s1","aimX":1e999,"aimY":3}]}}', 'reliable');
  await vi.runAllTimersAsync();
  session.tick();
  const p = world.getPlayer(1)!;
  expect(p.lastPressSeq).toBe(1);
  expect(p.held).toBe(255);
  expect(Number.isFinite(p.pos.x)).toBe(true);
});
