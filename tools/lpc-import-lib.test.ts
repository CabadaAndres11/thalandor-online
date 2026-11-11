import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCatalog,
  creditFor,
  importLpc,
  parseCsv,
  readCredits,
  readPalettes,
  renderCreditsMd,
  stripColorChunks,
  type LpcSelection,
} from './lpc-import-lib';

const REPO = fileURLToPath(new URL('./fixtures/lpc-mini', import.meta.url));

const selection: LpcSelection = {
  palettes: {
    body: { file: 'palette_definitions/body/body_ulpc.json', base: 'light', choices: ['light', 'amber'] },
    hair: { file: 'palette_definitions/hair/hair_ulpc.json', base: 'orange', choices: ['black'] },
    cloth: { file: 'palette_definitions/cloth/cloth_ulpc.json', base: 'white', choices: ['brown'] },
  },
  bodies: [{ id: 'male', layers: [{ src: 'body/bodies/male/walk.png', z: 10, recolor: 'body' }] }],
  hairStyles: [{ id: 'plain', src: 'hair/plain/adult/walk.png', z: 120 }],
  outfits: {
    warrior: { male: [{ src: 'weapon/sword/arming/universal/fg/walk/steel.png', z: 140, cloth: 'brown' }] },
  },
  tiles: {
    file: 'tiles/terrain_atlas.png',
    credit: { file: 'tiles/terrain_atlas.png', authors: ['Sharm'], licenses: ['CC-BY-SA 3.0'], urls: ['https://example.org/tiles'] },
  },
};

test('parseCsv handles quoted fields with commas and spaces after quotes', () => {
  expect(parseCsv('a,b\n"x, y" ,"z"\n')).toEqual([
    ['a', 'b'],
    ['x, y', 'z'],
  ]);
});

test('readCredits indexes credits by file', () => {
  const credits = readCredits(REPO);
  expect(credits.get('body/bodies/male/walk.png')).toEqual({
    file: 'body/bodies/male/walk.png',
    authors: ['Alice', 'Bob (bobby)'],
    licenses: ['OGA-BY 3.0', 'CC-BY-SA 3.0'],
    urls: ['https://example.org/a', 'https://example.org/b'],
  });
});

test('creditFor resolves variant files and falls back to parent folder', () => {
  const credits = readCredits(REPO);
  expect(creditFor('weapon/sword/arming/universal/fg/walk/steel.png', credits)?.authors).toEqual(['Dave']);
  expect(creditFor('hair/plain/adult/idle.png', credits)?.authors).toEqual(['Carol']);
  expect(creditFor('torso/unknown/walk.png', credits)).toBeNull();
});

test('buildCatalog maps selection ids, palettes and keeps layer data', () => {
  const cat = buildCatalog(selection, readPalettes(REPO, selection));
  expect(cat.bodies).toEqual([{ id: 'male', labelKey: 'appearance.body.male' }]);
  expect(cat.skins.map((s) => s.id)).toEqual(['light', 'amber']);
  expect(cat.skins[1]).toEqual({ id: 'amber', labelKey: 'appearance.skin.amber', swatch: '#100004' });
  expect(cat.hairColors).toEqual([{ id: 'black', labelKey: 'appearance.hairColor.black', swatch: '#300004' }]);
  expect(cat.palettes.body.base).toEqual(['#000001', '#000002', '#000003', '#000004', '#000005', '#000006']);
  expect(cat.palettes.cloth.colors.brown![0]).toBe('#500001');
  expect(cat.layers.body.male).toEqual([{ sheet: 'assets/lpc/characters/body/bodies/male/walk.png', zIndex: 10, recolor: { material: 'body' } }]);
  expect(cat.layers.hair.plain).toEqual({ sheet: 'assets/lpc/characters/hair/plain/adult/walk.png', zIndex: 120, recolor: { material: 'hair' } });
  expect(cat.layers.outfit.warrior!.male).toEqual([
    { sheet: 'assets/lpc/characters/weapon/sword/arming/universal/fg/walk/steel.png', zIndex: 140, recolor: { material: 'cloth', palette: 'brown' } },
  ]);
  expect(cat.tileset).toBe('assets/lpc/tiles/terrain_atlas.png');
});

test('renderCreditsMd lists every sheet with authors, licenses and urls', () => {
  const md = renderCreditsMd(
    [{ file: 'hair/plain/adult/walk.png', credit: { file: 'hair/plain/adult/walk.png', authors: ['Carol'], licenses: ['CC-BY-SA 3.0'], urls: ['https://example.org/hair'] } }],
    [{ file: 'tiles/terrain_atlas.png', authors: ['Sharm'], licenses: ['CC-BY-SA 3.0'], urls: ['https://example.org/tiles'] }],
  );
  expect(md.startsWith('# Créditos de arte')).toBe(true);
  for (const s of ['hair/plain/adult/walk.png', 'Carol', 'CC-BY-SA 3.0', 'https://example.org/hair', 'tiles/terrain_atlas.png', 'Sharm']) {
    expect(md).toContain(s);
  }
});

test('importLpc copies sheets and writes catalog and credits', () => {
  const out = mkdtempSync(join(tmpdir(), 'lpc-out-'));
  importLpc({ repoDir: REPO, tilesDir: REPO, outRoot: out, selection });
  expect(readFileSync(join(out, 'public/assets/lpc/characters/body/bodies/male/walk.png'), 'utf8')).toBe('PNGBODY');
  expect(existsSync(join(out, 'public/assets/lpc/tiles/terrain_atlas.png'))).toBe(true);
  const cat = JSON.parse(readFileSync(join(out, 'data/appearance/catalog.json'), 'utf8'));
  expect(cat.bodies[0].id).toBe('male');
  expect(readFileSync(join(out, 'CREDITS.md'), 'utf8')).toContain('Dave');
});

test('importLpc removes sheets that are no longer selected', () => {
  const out = mkdtempSync(join(tmpdir(), 'lpc-out-'));
  importLpc({ repoDir: REPO, tilesDir: REPO, outRoot: out, selection });
  const stale = join(out, 'public/assets/lpc/characters/old/walk.png');
  mkdirSync(join(out, 'public/assets/lpc/characters/old'), { recursive: true });
  writeFileSync(stale, 'x');
  importLpc({ repoDir: REPO, tilesDir: REPO, outRoot: out, selection });
  expect(existsSync(stale)).toBe(false);
});

test('import fails when a selected sheet has no credit', () => {
  const out = mkdtempSync(join(tmpdir(), 'lpc-out-'));
  const bad: LpcSelection = { ...selection, hairStyles: [{ id: 'x', src: 'torso/unknown/walk.png', z: 1 }] };
  expect(() => importLpc({ repoDir: REPO, tilesDir: REPO, outRoot: out, selection: bad })).toThrow(/torso\/unknown\/walk\.png/);
});

function chunk(type: string, data: number[] = []): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), Buffer.from(data), Buffer.from([1, 2, 3, 4])]);
}
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('stripColorChunks removes colour-management chunks and keeps the image data', () => {
  const png = Buffer.concat([SIG, chunk('IHDR', [0, 0, 0, 1]), chunk('cHRM', [9, 9]), chunk('gAMA', [7]), chunk('iCCP', [5]), chunk('sRGB', [0]), chunk('IDAT', [42, 43]), chunk('IEND')]);
  const out = stripColorChunks(png);
  expect(out.subarray(0, 8)).toEqual(SIG);
  const s = out.toString('latin1');
  for (const t of ['cHRM', 'gAMA', 'iCCP', 'sRGB']) expect(s).not.toContain(t);
  for (const t of ['IHDR', 'IDAT', 'IEND']) expect(s).toContain(t);
  expect(out.length).toBe(8 + chunk('IHDR', [0, 0, 0, 1]).length + chunk('IDAT', [42, 43]).length + chunk('IEND').length);
});

test('stripColorChunks leaves non-PNG data untouched', () => {
  const data = Buffer.from('not a png');
  expect(stripColorChunks(data)).toEqual(data);
});
