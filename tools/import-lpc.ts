/**
 * Imports the LPC layers listed in tools/lpc-selection.json into public/assets/lpc and
 * regenerates data/appearance/catalog.json and CREDITS.md.
 *
 * Usage: npx tsx tools/import-lpc.ts <lpcRepoDir> <tilesDir> <creaturesDir>
 *   lpcRepoDir: clone of LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
 *   tilesDir:   folder containing the extracted "LPC Tile Atlas" (atlas/terrain_atlas.png)
 *   creaturesDir: folder containing the extracted "[LPC] Monsters" pack (pack/lpc-monsters/*.png)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importLpc, type LpcSelection } from './lpc-import-lib';

const [repoDir, tilesDir, creaturesDir] = process.argv.slice(2);
if (!repoDir || !tilesDir || !creaturesDir) {
  console.error('Usage: npx tsx tools/import-lpc.ts <lpcRepoDir> <tilesDir> <creaturesDir>');
  process.exit(1);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const selection = JSON.parse(readFileSync(new URL('./lpc-selection.json', import.meta.url), 'utf8')) as LpcSelection;
importLpc({ repoDir, tilesDir, creaturesDir, outRoot: root, selection });
console.log('LPC import done: public/assets/lpc, data/appearance/catalog.json, CREDITS.md');
