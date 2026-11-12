/**
 * Generates data/maps/test-arena.json: a 40x30 Tiled map (32 px tiles) using the LPC terrain atlas,
 * with grass, a crossing dirt path, a stone border and eight 2x2 stone pillars off the paths.
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
  [8, 7], [13, 7], [26, 7], [31, 7],
  [8, 21], [13, 21], [26, 21], [31, 21],
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

/** Monster spawn points (pixel coordinates), all at least 8 tiles from the player spawn. */
const SPAWNS: { monster: string; tx: number; ty: number; count: number; respawnMs: number }[] = [
  { monster: 'skeleton', tx: 5, ty: 4, count: 2, respawnMs: 30000 },
  { monster: 'skeleton', tx: 34, ty: 4, count: 2, respawnMs: 30000 },
  { monster: 'goblin_shaman', tx: 16, ty: 23, count: 1, respawnMs: 40000 },
  { monster: 'goblin_shaman', tx: 29, ty: 5, count: 1, respawnMs: 40000 },
  { monster: 'bat', tx: 33, ty: 11, count: 3, respawnMs: 30000 },
  { monster: 'orc_elite', tx: 4, ty: 26, count: 1, respawnMs: 60000 },
];

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
  nextlayerid: 5,
  nextobjectid: SPAWNS.length + 2,
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
  layers: [
    layer(1, 'ground', ground),
    layer(2, 'decor', new Array<number>(W * H).fill(0)),
    layer(3, 'collision', collision),
    {
      id: 4,
      name: 'spawns',
      type: 'objectgroup',
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      objects: SPAWNS.map((sp, i) => ({
        id: i + 1,
        name: sp.monster,
        type: 'spawn',
        x: sp.tx * T + T / 2,
        y: sp.ty * T + T / 2,
        width: 0,
        height: 0,
        point: true,
        visible: true,
        rotation: 0,
        properties: [
          { name: 'monster', type: 'string', value: sp.monster },
          { name: 'count', type: 'int', value: sp.count },
          { name: 'respawnMs', type: 'int', value: sp.respawnMs },
        ],
      })),
    },
    {
      id: 5,
      name: 'npcs',
      type: 'objectgroup',
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      // Temporary merchant (Plan 5) next to the spawn; it moves to the capital in Plan 6.
      objects: [
        {
          id: SPAWNS.length + 1,
          name: 'Merchant',
          type: 'npc',
          x: 23 * T + T / 2,
          y: 14 * T + T / 2,
          width: 0,
          height: 0,
          point: true,
          visible: true,
          rotation: 0,
          properties: [{ name: 'role', type: 'string', value: 'merchant' }],
        },
      ],
    },
  ],
};

const out = fileURLToPath(new URL('../data/maps/test-arena.json', import.meta.url));
writeFileSync(out, JSON.stringify(map));
console.log(`wrote ${out}`);
