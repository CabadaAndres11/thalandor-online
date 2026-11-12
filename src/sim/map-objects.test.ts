import arena from '../../data/maps/test-arena.json';
import type { TiledMap } from './collision-map';
import { MONSTERS } from './combat/defs';
import { spawnsFromTiled } from './map-objects';

const base: TiledMap = { width: 10, height: 10, tilewidth: 32, tileheight: 32, layers: [] };

test('reads spawn points from the "spawns" object layer', () => {
  const json = {
    ...base,
    layers: [
      {
        name: 'spawns',
        type: 'objectgroup',
        objects: [
          { id: 7, x: 100, y: 200, properties: [{ name: 'monster', value: 'skeleton' }, { name: 'count', value: 2 }, { name: 'respawnMs', value: 30000 }] },
          { id: 8, x: 5, y: 6, properties: [{ name: 'monster', value: 'bat' }] },
        ],
      },
    ],
  } as unknown as TiledMap;
  expect(spawnsFromTiled(json)).toEqual([
    { id: 7, monster: 'skeleton', x: 100, y: 200, count: 2, respawnMs: 30000 },
    { id: 8, monster: 'bat', x: 5, y: 6, count: 1, respawnMs: 45000 },
  ]);
});

test('ignores unknown monsters and maps without a spawns layer', () => {
  expect(spawnsFromTiled(base)).toEqual([]);
  const json = { ...base, layers: [{ name: 'spawns', type: 'objectgroup', objects: [{ id: 1, x: 1, y: 1, properties: [{ name: 'monster', value: 'dragon' }] }] }] } as unknown as TiledMap;
  expect(spawnsFromTiled(json)).toEqual([]);
});

test('the test arena has spawns of every test monster, far from the player spawn', () => {
  const map = arena as unknown as TiledMap;
  const spawns = spawnsFromTiled(map);
  const types = new Set(spawns.map((s) => s.monster));
  for (const t of ['skeleton', 'goblin_shaman', 'bat', 'orc_elite']) expect(types.has(t)).toBe(true);
  const sx = 20 * 32;
  const sy = 15 * 32;
  for (const s of spawns) expect(Math.hypot(s.x - sx, s.y - sy)).toBeGreaterThanOrEqual(8 * 32);
  for (const s of spawns) expect(MONSTERS[s.monster]).toBeDefined();
});
