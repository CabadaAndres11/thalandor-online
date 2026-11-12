import { TILE_SIZE } from '../constants';
import { CollisionMap } from '../collision-map';
import { addPlayer, steps, testWorld } from '../combat/test-world';
import { findPath, lineOfSight } from './path';

const TPS = 20;

describe('pathfinding and line of sight', () => {
  test('A* routes around a pillar', () => {
    const solid = new Uint8Array(20 * 20);
    for (let y = 3; y <= 12; y++) solid[y * 20 + 8] = 1;
    const map = new CollisionMap(20, 20, solid);
    const path = findPath(map, { x: 5 * TILE_SIZE + 16, y: 8 * TILE_SIZE + 16 }, { x: 12 * TILE_SIZE + 16, y: 8 * TILE_SIZE + 16 });
    expect(path.length).toBeGreaterThan(1);
    for (const p of path) expect(map.isSolidAt(p.x, p.y)).toBe(false);
    expect(path.some((p) => p.y < 3 * TILE_SIZE || p.y > 13 * TILE_SIZE)).toBe(true);
    expect(path.at(-1)).toEqual({ x: 12 * TILE_SIZE + 16, y: 8 * TILE_SIZE + 16 });
  });

  test('line of sight is blocked by walls', () => {
    const solid = new Uint8Array(20 * 20);
    solid[5 * 20 + 5] = 1;
    const map = new CollisionMap(20, 20, solid);
    expect(lineOfSight(map, { x: 2 * TILE_SIZE, y: 5 * TILE_SIZE + 16 }, { x: 9 * TILE_SIZE, y: 5 * TILE_SIZE + 16 })).toBe(false);
    expect(lineOfSight(map, { x: 2 * TILE_SIZE, y: 2 * TILE_SIZE }, { x: 9 * TILE_SIZE, y: 2 * TILE_SIZE })).toBe(true);
  });
});

describe('monster AI', () => {
  test('aggro needs range and line of sight', () => {
    const solid: [number, number][] = [];
    for (let y = 0; y < 20; y++) solid.push([10, y]);
    const w = testWorld({ solid });
    const p = addPlayer(w, 'warrior', { x: 8 * TILE_SIZE, y: 300 });
    const behindWall = w.addMonster('skeleton', { x: 12 * TILE_SIZE, y: 300 });
    const far = w.addMonster('skeleton', { x: 8 * TILE_SIZE, y: 300 + 400 > 600 ? 600 : 700 });
    steps(w, 5);
    expect(behindWall.ai!.state).toBe('idle');
    expect(far.ai!.state).toBe('idle');
    const near = w.addMonster('skeleton', { x: 8 * TILE_SIZE, y: 420 });
    steps(w, 2);
    expect(near.ai!.state).toBe('combat');
    expect(near.ai!.threat.has(p.id)).toBe(true);
  });

  test('melee monster chases and hits the player', () => {
    const w = testWorld();
    const p = addPlayer(w, 'mage', { x: 300, y: 300 });
    w.addMonster('skeleton', { x: 440, y: 300 });
    steps(w, 4 * TPS);
    expect(p.hp).toBeLessThan(p.stats.maxHp);
  });

  test('leash: returns home and resets health and threat', () => {
    const w = testWorld();
    const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const mob = w.addMonster('skeleton', { x: 380, y: 300 });
    w.damage(mob, 20, p, 'physical');
    p.pos = { x: 900, y: 600 };
    mob.pos = { x: 860, y: 600 };
    steps(w, 2);
    expect(mob.ai!.state).toBe('return');
    expect(mob.hp).toBe(mob.stats.maxHp);
    expect(mob.ai!.threat.size).toBe(0);
    steps(w, 15 * TPS);
    expect(mob.ai!.state).toBe('idle');
    expect(Math.hypot(mob.pos.x - 380, mob.pos.y - 300)).toBeLessThan(80);
  });

  test('ranged monster keeps its distance', () => {
    const w = testWorld();
    const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const shaman = w.addMonster('goblin_shaman', { x: 360, y: 300 });
    w.damage(shaman, 1, p, 'physical');
    steps(w, 2 * TPS);
    expect(Math.hypot(shaman.pos.x - p.pos.x, shaman.pos.y - p.pos.y)).toBeGreaterThan(120);
  });

  test('pack monsters alert their neighbours when hit', () => {
    const w = testWorld();
    const p = addPlayer(w, 'explorer', { x: 100, y: 100 });
    const a = w.addMonster('bat', { x: 600, y: 300 });
    const b = w.addMonster('bat', { x: 650, y: 320 });
    w.damage(a, 1, p, 'physical');
    expect(b.ai!.threat.has(p.id)).toBe(true);
  });

  test('taunt makes the monster attack the taunter', () => {
    const w = testWorld();
    const tank = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const dps = addPlayer(w, 'mage', { x: 340, y: 300 });
    const mob = w.addMonster('skeleton', { x: 320, y: 340 });
    w.damage(mob, 30, dps, 'arcane');
    w.damage(mob, 1, tank, 'physical');
    expect(w.topTarget(mob)?.id).toBe(dps.id);
    mob.statuses.push({ kind: 'taunt', until: w.now + 3000, sourceId: tank.id });
    expect(w.topTarget(mob)?.id).toBe(tank.id);
  });
});

describe('spawns and group scaling', () => {
  test('a killed monster respawns after respawnMs at its spawn point', () => {
    const w = testWorld({ world: { spawns: [{ id: 1, monster: 'skeleton', x: 200, y: 200, count: 1, respawnMs: 2000 }] } });
    w.step();
    const mob = w.allUnits().find((u) => u.kind === 'monster')!;
    w.damage(mob, 9999, null, 'physical');
    expect(mob.state).toBe('dead');
    steps(w, 2 * TPS + 2);
    const alive = w.allUnits().filter((u) => u.kind === 'monster' && u.state === 'alive');
    expect(alive).toHaveLength(1);
    expect(Math.hypot(alive[0]!.pos.x - 200, alive[0]!.pos.y - 200)).toBeLessThan(40);
  });

  test('monster health scales with the number of players, keeping the percentage', () => {
    const w = testWorld();
    addPlayer(w, 'warrior', { x: 100, y: 100 });
    const mob = w.addMonster('skeleton', { x: 600, y: 600 });
    const base = mob.stats.maxHp;
    mob.hp = base / 2;
    addPlayer(w, 'cleric', { x: 120, y: 100 });
    addPlayer(w, 'mage', { x: 140, y: 100 });
    w.step();
    expect(mob.stats.maxHp).toBeCloseTo(base * (1 + 0.75 * 2), 5);
    expect(mob.hp / mob.stats.maxHp).toBeCloseTo(0.5, 2);
  });
});
