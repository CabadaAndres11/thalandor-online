/**
 * Imports the LPC layers listed in tools/lpc-selection.json into public/assets/lpc and
 * regenerates data/appearance/catalog.json and CREDITS.md.
 *
 * Usage: npx tsx tools/import-lpc.ts <lpcRepoDir> <tilesDir>
 *   lpcRepoDir: clone of LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
 *   tilesDir:   folder containing the extracted "LPC Tile Atlas" (atlas/terrain_atlas.png)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importLpc, type LpcSelection } from './lpc-import-lib';

const [repoDir, tilesDir] = process.argv.slice(2);
if (!repoDir || !tilesDir) {
  console.error('Usage: npx tsx tools/import-lpc.ts <lpcRepoDir> <tilesDir>');
  process.exit(1);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const selection = JSON.parse(readFileSync(new URL('./lpc-selection.json', import.meta.url), 'utf8')) as LpcSelection;
importLpc({ repoDir, tilesDir, outRoot: root, selection });
console.log('LPC import done: public/assets/lpc, data/appearance/catalog.json, CREDITS.md');
