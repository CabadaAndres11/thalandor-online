/**
 * Generates data/maps/test-arena.json: a 40x30 Tiled map (32 px tiles) using the LPC terrain atlas,
 * with grass, a crossing dirt path, a stone border and six 2x2 stone pillars.
 * Run with: npx tsx tools/gen-test-arena.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 40;
const H = 30;
const T = 32;
const ATLAS_COLS = 32;
/** gid = row * 32 + col + 1 in the 1024x1024 LPC terrain atlas. */
const gid = (col: number, row: number) => row * ATLAS_COLS + col + 1;
const GRASS = gid(22, 3);
const GRASS_VARIANTS = [gid(21, 5), gid(22, 5), gid(23, 5)];
const DIRT = gid(16, 3);
const WALL = gid(17, 24);
const PILLARS: [number, number][] = [
  [8, 7], [19, 7], [30, 7],
  [8, 21], [19, 21], [30, 21],
];

/** Small deterministic PRNG so the map is identical on every run. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 2 ** 32;
  };
}

const rand = rng(7);
const ground = Array.from({ length: W * H }, () => (rand() < 0.12 ? GRASS_VARIANTS[Math.floor(rand() * 3)]! : GRASS));
for (let x = 0; x < W; x++) for (const y of [14, 15]) ground[y * W + x] = DIRT;
for (let y = 0; y < H; y++) for (const x of [19, 20]) ground[y * W + x] = DIRT;

const collision = new Array<number>(W * H).fill(0);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) collision[y * W + x] = WALL;
  }
}
for (const [px, py] of PILLARS) {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) collision[(py + dy) * W + px + dx] = WALL;
}

const layer = (id: number, name: string, data: number[]) => ({ id, name, type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data });

const map = {
  type: 'map',
  version: '1.10',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: W,
  height: H,
  tilewidth: T,
  tileheight: T,
  nextlayerid: 4,
  nextobjectid: 1,
  properties: [
    { name: 'spawnX', type: 'int', value: (W / 2) * T },
    { name: 'spawnY', type: 'int', value: (H / 2) * T },
  ],
  tilesets: [
    {
      firstgid: 1,
      name: 'terrain',
      tilewidth: T,
      tileheight: T,
      tilecount: 1024,
      columns: ATLAS_COLS,
      image: '../../public/assets/lpc/tiles/terrain_atlas.png',
      imagewidth: 1024,
      imageheight: 1024,
      margin: 0,
      spacing: 0,
    },
  ],
  layers: [layer(1, 'ground', ground), layer(2, 'decor', new Array<number>(W * H).fill(0)), layer(3, 'collision', collision)],
};

const out = fileURLToPath(new URL('../data/maps/test-arena.json', import.meta.url));
writeFileSync(out, JSON.stringify(map));
console.log(`wrote ${out}`);
