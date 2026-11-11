/**
 * Generates data/maps/test-arena.json: a 40x30 Tiled map with a solid border and six 2x2 pillars.
 * Run with: npx tsx tools/gen-test-arena.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 40;
const H = 30;
const T = 16;
const PILLARS: [number, number][] = [
  [8, 7], [19, 7], [30, 7],
  [8, 21], [19, 21], [30, 21],
];

const ground = new Array<number>(W * H).fill(1);
const collision = new Array<number>(W * H).fill(0);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) collision[y * W + x] = 2;
  }
}
for (const [px, py] of PILLARS) {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) collision[(py + dy) * W + px + dx] = 2;
}

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
  nextlayerid: 3,
  nextobjectid: 1,
  properties: [
    { name: 'spawnX', type: 'int', value: (W / 2) * T },
    { name: 'spawnY', type: 'int', value: (H / 2) * T + T / 2 },
  ],
  tilesets: [{ firstgid: 1, name: 'placeholder', tilewidth: T, tileheight: T, tilecount: 2, columns: 2, image: 'placeholder.png', imagewidth: 2 * T, imageheight: T, margin: 0, spacing: 0 }],
  layers: [
    { id: 1, name: 'ground', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: ground },
    { id: 2, name: 'collision', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: collision },
  ],
};

const out = fileURLToPath(new URL('../data/maps/test-arena.json', import.meta.url));
writeFileSync(out, JSON.stringify(map));
console.log(`wrote ${out}`);
