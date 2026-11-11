import { CollisionMap, type TiledMap } from './collision-map';

function tiled(data: number[], w = 3, h = 2, layer = 'collision'): TiledMap {
  return { width: w, height: h, tilewidth: 16, tileheight: 16, layers: [{ name: layer, type: 'tilelayer', data }] };
}

test('out of bounds is solid', () => {
  const map = new CollisionMap(3, 2, new Uint8Array(6));
  expect(map.isSolidTile(-1, 0)).toBe(true);
  expect(map.isSolidTile(3, 0)).toBe(true);
  expect(map.isSolidTile(0, -1)).toBe(true);
  expect(map.isSolidTile(0, 2)).toBe(true);
  expect(map.isSolidTile(0, 0)).toBe(false);
});

test('fromTiled reads collision layer', () => {
  const map = CollisionMap.fromTiled(tiled([0, 1, 0, 0, 0, 0]));
  expect(map.isSolidTile(1, 0)).toBe(true);
  expect(map.isSolidTile(0, 0)).toBe(false);
  expect(map.isSolidAt(16 + 3, 5)).toBe(true);
  expect(map.isSolidAt(3, 20)).toBe(false);
});

test('fromTiled throws if layer missing', () => {
  expect(() => CollisionMap.fromTiled(tiled([0, 0, 0, 0, 0, 0], 3, 2, 'ground'))).toThrow();
});
