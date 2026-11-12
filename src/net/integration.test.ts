import { netChar } from '../test-fixtures';
import { CollisionMap } from '../sim/collision-map';
import { World } from '../sim/world';
import { HostSession } from '../host/host-session';
import { startTickLoop } from '../host/tick-loop';
import { ClientSession } from '../client/client-session';
import { createMemoryNetwork } from './memory-transport';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function startGame() {
  const map = new CollisionMap(30, 30, new Uint8Array(900));
  const world = new World(map, { x: 240, y: 240 });
  const session = new HostSession(world, { version: '0.1.0', mapId: 'test', defaultName: 'Aventurero', now: () => Date.now() });
  const net = createMemoryNetwork({ latencyMs: 100, lossRate: 0.1, rng: mulberry32(42) });
  const host = net.createHost('ABC234');
  host.onConnection((c) => session.attach(c));
  const stop = startTickLoop(() => session.tick(), { now: () => Date.now() });
  const clients: ClientSession[] = [];
  for (const name of ['Ana', 'Beto', 'Cira']) {
    const p = net.createClient().connect('ABC234');
    await vi.advanceTimersByTimeAsync(150);
    clients.push(new ClientSession(await p, { version: '0.1.0', character: netChar(name), map, now: () => Date.now() }));
  }
  await vi.advanceTimersByTimeAsync(500);
  return { world, clients, stop };
}

test('three clients join and see each other', async () => {
  const { clients, stop } = await startGame();
  for (const c of clients) {
    expect(c.playerId).not.toBeNull();
    expect(c.renderState(Date.now()).others.size).toBe(2);
  }
  stop();
});

test('predicted position converges to host within 0.5px after inputs stop', async () => {
  const { world, clients, stop } = await startGame();
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const;
  let moving = true;
  const timer = setInterval(() => {
    clients.forEach((c, i) => {
      const [mx, my] = moving ? dirs[i]! : [0, 0];
      c.sendInput({ moveX: mx, moveY: my, aimX: 0, aimY: 0 });
    });
  }, 50);
  await vi.advanceTimersByTimeAsync(2000);
  moving = false;
  await vi.advanceTimersByTimeAsync(1000);
  for (const c of clients) {
    const self = c.renderState(Date.now()).self!.pos;
    const hostPos = world.getPlayer(c.playerId!)!.pos;
    expect(Math.abs(self.x - hostPos.x)).toBeLessThan(0.5);
    expect(Math.abs(self.y - hostPos.y)).toBeLessThan(0.5);
  }
  // Each client actually moved a substantial distance.
  const moved = clients.map((c) => {
    const p = world.getPlayer(c.playerId!)!.pos;
    return Math.hypot(p.x - 240, p.y - 240);
  });
  for (const d of moved) expect(d).toBeGreaterThan(100);
  clearInterval(timer);
  stop();
});

describe('combat over the network', () => {
  async function duo(opts: { latencyMs: number; lossRate: number }, classId: 'mage' | 'warrior' = 'mage') {
    const map = new CollisionMap(30, 30, new Uint8Array(900));
    const world = new World(map, { x: 480, y: 480 }, { rng: () => 0.5 });
    const session = new HostSession(world, { version: '0.1.0', mapId: 'test', defaultName: 'Aventurero', now: () => Date.now() });
    const net = createMemoryNetwork({ ...opts, rng: mulberry32(7) });
    net.createHost('ABC234').onConnection((c) => session.attach(c));
    const stop = startTickLoop(() => session.tick(), { now: () => Date.now() });
    const p = net.createClient().connect('ABC234');
    await vi.advanceTimersByTimeAsync(150);
    const client = new ClientSession(await p, { version: '0.1.0', character: netChar('Ana', classId), map, now: () => Date.now() });
    await vi.advanceTimersByTimeAsync(400);
    return { world, client, stop };
  }

  test('presses survive loss and run once', async () => {
    const { world, client, stop } = await duo({ latencyMs: 60, lossRate: 0.5 });
    const casts: number[] = [];
    client.on('combat', ({ list }) => {
      for (const e of list) if (e.e === 'cast' && e.src === client.playerId) casts.push(1);
    });
    client.press('rmb', { x: 480, y: 480 });
    const timer = setInterval(() => client.sendInput({ moveX: 0, moveY: 0, aimX: 480, aimY: 480 }), 50);
    await vi.advanceTimersByTimeAsync(1500);
    clearInterval(timer);
    stop();
    const me = world.getPlayer(client.playerId!)!;
    expect(me.lastPressSeq).toBe(1);
    expect(casts).toHaveLength(1);
  });

  test('a predicted dodge ends where the host puts it', async () => {
    const { world, client, stop } = await duo({ latencyMs: 80, lossRate: 0 });
    client.press('dodge', { x: 600, y: 480 });
    const timer = setInterval(() => client.sendInput({ moveX: 1, moveY: 0, aimX: 600, aimY: 480 }), 50);
    await vi.advanceTimersByTimeAsync(150);
    clearInterval(timer);
    const idle = setInterval(() => client.sendInput({ moveX: 0, moveY: 0, aimX: 600, aimY: 480 }), 50);
    await vi.advanceTimersByTimeAsync(800);
    clearInterval(idle);
    stop();
    const host = world.getPlayer(client.playerId!)!.pos;
    const self = client.renderState(Date.now()).self!.pos;
    expect(Math.abs(self.x - host.x)).toBeLessThan(0.5);
    expect(host.x - 480).toBeGreaterThanOrEqual(95.9);
  });
});

test('snapshots only include units within the interest range', () => {
  const map = new CollisionMap(60, 60, new Uint8Array(3600));
  const world = new World(map, { x: 100, y: 100 }, { rng: () => 0.5 });
  const p = world.addPlayer({ name: 'Ana', classId: 'mage', appearance: netChar('Ana').appearance }, { x: 100, y: 100 });
  const near = world.addMonster('skeleton', { x: 400, y: 100 });
  const far = world.addMonster('skeleton', { x: 1500, y: 1500 });
  const { snap, me } = world.snapshotFor(p.id);
  const ids = snap.units.map((u) => u.id);
  expect(ids).toContain(p.id);
  expect(ids).toContain(near.id);
  expect(ids).not.toContain(far.id);
  expect(me?.resourceKind).toBe('mana');
});
