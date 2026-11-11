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
    clients.push(new ClientSession(await p, { version: '0.1.0', name, map, now: () => Date.now() }));
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
    const self = c.renderState(Date.now()).self!;
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
