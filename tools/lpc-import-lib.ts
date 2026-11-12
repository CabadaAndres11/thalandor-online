/**
 * Pure helpers for importing a curated subset of the LPC (Liberated Pixel Cup) art.
 * Source: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ACTION_ANIMS,
  type ActionAnim,
  type AnimSheet,
  type AppearanceCatalog,
  type LayerRef,
  type Material,
  type PaletteSet,
} from '../src/appearance/catalog-types';
import { ANIM_GEOMETRY } from '../src/appearance/lpc-frames';

export interface LpcCredit {
  file: string;
  authors: string[];
  licenses: string[];
  urls: string[];
}

export interface SelLayer {
  /** Walk sheet, relative to the repo's spritesheets/ folder. */
  src: string;
  z: number;
  /** body/hair: recolored with the player's choice (or `palette` when fixed). */
  recolor?: 'body' | 'hair';
  /** Fixed palette for a body/hair layer (monsters). */
  palette?: string;
  /** Fixed cloth palette name (sheet drawn in the cloth base palette). */
  cloth?: string;
  /** Explicit sheets for action animations (e.g. oversize weapon attacks); others are discovered. */
  anims?: Partial<Record<ActionAnim, string>>;
  /** Drawn only during its action animations (e.g. the bow while shooting). */
  actionOnly?: boolean;
}

export interface CreatureSel {
  /** Relative to the creatures folder (LPC Monsters pack). */
  file: string;
  moveFrames: number[];
  attackFrames: number[];
  credit: LpcCredit;
}

export interface LpcSelection {
  palettes: Record<Material, { file: string; base: string; choices: string[] }>;
  bodies: { id: string; layers: SelLayer[] }[];
  hairStyles: { id: string; src: string; z: number }[];
  outfits: Record<string, Record<string, SelLayer[]>>;
  monsterLooks?: Record<string, SelLayer[]>;
  creatures?: Record<string, CreatureSel>;
  tiles: { file: string; credit: LpcCredit };
}

const CHAR_PREFIX = 'assets/lpc/characters/';
const TILES_PREFIX = 'assets/lpc/tiles/';
const CREATURE_PREFIX = 'assets/lpc/creatures/';

/** Minimal RFC-4180-ish CSV parser; tolerates spaces between a closing quote and the comma. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      quoted = true;
      wasQuoted = true;
    } else if (c === ',') {
      row.push(wasQuoted ? field : field.trim());
      field = '';
      wasQuoted = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(wasQuoted ? field : field.trim());
      rows.push(row);
      row = [];
      field = '';
      wasQuoted = false;
    } else if (!(wasQuoted && c === ' ')) field += c;
  }
  if (field !== '' || row.length) {
    row.push(wasQuoted ? field : field.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

const splitList = (s: string | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export function readCredits(repoDir: string): Map<string, LpcCredit> {
  const rows = parseCsv(readFileSync(join(repoDir, 'CREDITS.csv'), 'utf8'));
  const map = new Map<string, LpcCredit>();
  for (const [file, , authors, licenses, urls] of rows.slice(1)) {
    if (!file) continue;
    map.set(file, { file, authors: splitList(authors), licenses: splitList(licenses), urls: splitList(urls) });
  }
  return map;
}

/** Exact key, then "x/<anim>/<variant>.png" as "x/<anim>.png", then the longest parent folder. */
export function creditFor(sheetPath: string, credits: Map<string, LpcCredit>): LpcCredit | null {
  const exact = credits.get(sheetPath);
  if (exact) return exact;
  const variant = sheetPath.match(/^(.*)\/([^/]+)\/[^/]+\.png$/);
  if (variant) {
    const collapsed = credits.get(`${variant[1]}/${variant[2]}.png`);
    if (collapsed) return collapsed;
  }
  let dir = dirname(sheetPath);
  while (dir && dir !== '.') {
    for (const [key, credit] of credits) if (key.startsWith(`${dir}/`)) return credit;
    dir = dirname(dir);
  }
  return null;
}

/** Width and height from a PNG's IHDR chunk, or null when the file is missing or not a PNG. */
export function pngSize(file: string): { w: number; h: number } | null {
  if (!existsSync(file)) return null;
  const b = readFileSync(file);
  if (b.length < 24 || !b.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** The sibling of a walk sheet for another animation: ".../walk.png" -> ".../<anim>.png", ".../walk/x.png" -> ".../<anim>/x.png". */
export function siblingPath(walkSrc: string, anim: string): string {
  return walkSrc.includes('/walk/') ? walkSrc.replace('/walk/', `/${anim}/`) : walkSrc.replace(/walk\.png$/, `${anim}.png`);
}

/**
 * Action animation sheets for a layer: explicit overrides first, then siblings of the walk sheet.
 * frameSize comes from the sheet width and the animation's frame count.
 */
export function discoverAnims(repoDir: string, l: SelLayer): Partial<Record<ActionAnim, { src: string; frameSize: number }>> {
  const out: Partial<Record<ActionAnim, { src: string; frameSize: number }>> = {};
  for (const anim of ACTION_ANIMS) {
    const explicit = l.anims?.[anim];
    const src = explicit ?? siblingPath(l.src, anim);
    if (!explicit && src === l.src) continue;
    const size = pngSize(join(repoDir, 'spritesheets', src));
    if (!size) continue;
    const frameSize = size.w / ANIM_GEOMETRY[anim].frames;
    if (!Number.isInteger(frameSize) || size.h !== frameSize * ANIM_GEOMETRY[anim].rows) continue;
    out[anim] = { src, frameSize };
  }
  return out;
}

type AnimsFor = (l: SelLayer) => Partial<Record<ActionAnim, { src: string; frameSize: number }>>;

function allSelLayers(sel: LpcSelection): SelLayer[] {
  const out: SelLayer[] = [];
  for (const b of sel.bodies) out.push(...b.layers);
  for (const h of sel.hairStyles) out.push({ src: h.src, z: h.z, recolor: 'hair' });
  for (const byBody of Object.values(sel.outfits)) for (const ls of Object.values(byBody)) out.push(...ls);
  for (const ls of Object.values(sel.monsterLooks ?? {})) out.push(...ls);
  return out;
}

export function readPalettes(repoDir: string, sel: LpcSelection): Record<Material, PaletteSet> {
  const out = {} as Record<Material, PaletteSet>;
  const layers = allSelLayers(sel);
  for (const material of Object.keys(sel.palettes) as Material[]) {
    const def = sel.palettes[material];
    const all = JSON.parse(readFileSync(join(repoDir, def.file), 'utf8')) as Record<string, string[]>;
    const pick = (name: string) => {
      const ramp = all[name];
      if (!ramp || ramp.length !== 6) throw new Error(`palette ${material}/${name} missing or not 6 colors`);
      return ramp.map((c) => c.toLowerCase());
    };
    const names = new Set([...def.choices]);
    for (const l of layers) {
      if (material === 'cloth' && l.cloth) names.add(l.cloth);
      if (l.recolor === material && l.palette) names.add(l.palette);
    }
    out[material] = { base: pick(def.base), colors: Object.fromEntries([...names].map((n) => [n, pick(n)])) };
  }
  return out;
}

function toLayer(l: SelLayer, animsFor: AnimsFor): LayerRef {
  const ref: LayerRef = { sheet: CHAR_PREFIX + l.src, zIndex: l.z };
  if (l.recolor) ref.recolor = l.palette ? { material: l.recolor, palette: l.palette } : { material: l.recolor };
  else if (l.cloth) ref.recolor = { material: 'cloth', palette: l.cloth };
  const found = animsFor(l);
  const anims: Partial<Record<ActionAnim, AnimSheet>> = {};
  for (const [anim, a] of Object.entries(found) as [ActionAnim, { src: string; frameSize: number }][]) {
    anims[anim] = { sheet: CHAR_PREFIX + a.src, frameSize: a.frameSize };
  }
  if (Object.keys(anims).length) ref.anims = anims;
  if (l.actionOnly) ref.actionOnly = true;
  return ref;
}

export function buildCatalog(sel: LpcSelection, palettes: Record<Material, PaletteSet>, animsFor: AnimsFor = () => ({})): AppearanceCatalog {
  const swatch = (m: Material, id: string) => palettes[m].colors[id]![3]!;
  const L = (l: SelLayer) => toLayer(l, animsFor);
  return {
    palettes,
    bodies: sel.bodies.map((b) => ({ id: b.id, labelKey: `appearance.body.${b.id}` })),
    skins: sel.palettes.body.choices.map((id) => ({ id, labelKey: `appearance.skin.${id}`, swatch: swatch('body', id) })),
    hairStyles: sel.hairStyles.map((h) => ({ id: h.id, labelKey: `appearance.hair.${h.id}` })),
    hairColors: sel.palettes.hair.choices.map((id) => ({ id, labelKey: `appearance.hairColor.${id}`, swatch: swatch('hair', id) })),
    layers: {
      body: Object.fromEntries(sel.bodies.map((b) => [b.id, b.layers.map(L)])),
      hair: Object.fromEntries(sel.hairStyles.map((h) => [h.id, L({ src: h.src, z: h.z, recolor: 'hair' })])),
      outfit: Object.fromEntries(
        Object.entries(sel.outfits).map(([cls, byBody]) => [cls, Object.fromEntries(Object.entries(byBody).map(([b, ls]) => [b, ls.map(L)]))]),
      ),
      monster: Object.fromEntries(Object.entries(sel.monsterLooks ?? {}).map(([id, ls]) => [id, ls.map(L)])),
    },
    creatures: Object.fromEntries(
      Object.entries(sel.creatures ?? {}).map(([id, c]) => [
        id,
        { sheet: CREATURE_PREFIX + c.file.split('/').pop(), frameSize: 64, moveFrames: c.moveFrames, attackFrames: c.attackFrames },
      ]),
    ),
    tileset: TILES_PREFIX + sel.tiles.file.split('/').pop(),
  };
}

export function renderCreditsMd(entries: { file: string; credit: LpcCredit }[], extra: LpcCredit[], creatures: LpcCredit[] = []): string {
  const block = (file: string, c: LpcCredit) =>
    [`### \`${file}\``, `- **Autores:** ${c.authors.join(', ')}`, `- **Licencias:** ${c.licenses.join(', ')}`, `- **Fuentes:** ${c.urls.map((u) => `<${u}>`).join(' · ')}`, ''].join('\n');
  const lines = [
    '# Créditos de arte',
    '',
    'Arte del proyecto [Liberated Pixel Cup (LPC)](https://lpc.opengameart.org/) y derivados, usado según sus licencias',
    '(CC-BY-SA, OGA-BY, GPL o LGPL según cada pieza). Archivo generado por `tools/import-lpc.ts`: no editar a mano.',
    '',
    '## Personajes',
    '',
    ...[...entries].sort((a, b) => a.file.localeCompare(b.file)).map((e) => block(e.file, e.credit)),
    '## Tiles',
    '',
    ...extra.map((c) => block(c.file, c)),
  ];
  if (creatures.length) lines.push('## Criaturas', '', ...creatures.map((c) => block(c.file, c)));
  return lines.join('\n');
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Colour-management chunks: browsers may apply them on decode, which breaks exact palette matching. */
const COLOR_CHUNKS = new Set(['cHRM', 'gAMA', 'iCCP', 'sRGB']);

/** Returns the PNG without colour-management chunks (other chunks are copied byte for byte). */
export function stripColorChunks(png: Buffer): Buffer {
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) return png;
  const parts: Buffer[] = [PNG_SIGNATURE];
  let off = 8;
  while (off + 12 <= png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    const end = off + 12 + len;
    if (end > png.length) return png; // malformed: leave untouched
    if (!COLOR_CHUNKS.has(type)) parts.push(png.subarray(off, end));
    off = end;
  }
  return Buffer.concat(parts);
}

const copyStripped = (from: string, to: string) => {
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, stripColorChunks(readFileSync(from)));
};

export function importLpc(opts: { repoDir: string; tilesDir: string; creaturesDir?: string; outRoot: string; selection: LpcSelection }): void {
  const { repoDir, tilesDir, outRoot, selection } = opts;
  const credits = readCredits(repoDir);
  const animsFor: AnimsFor = (l) => discoverAnims(repoDir, l);
  const files = new Set<string>();
  for (const l of allSelLayers(selection)) {
    files.add(l.src);
    for (const a of Object.values(animsFor(l))) files.add(a.src);
  }
  const entries = [...files].map((file) => {
    const credit = creditFor(file, credits);
    if (!credit) throw new Error(`No credit found for selected sheet: ${file}`);
    if (!existsSync(join(repoDir, 'spritesheets', file))) throw new Error(`Selected sheet not found: ${file}`);
    return { file, credit };
  });
  const creatures = Object.values(selection.creatures ?? {});
  if (creatures.length && !opts.creaturesDir) throw new Error('creaturesDir is required when the selection has creatures');
  const catalog = buildCatalog(selection, readPalettes(repoDir, selection), animsFor);
  // The output folder is fully generated: start clean so deselected sheets do not linger.
  rmSync(join(outRoot, 'public', 'assets', 'lpc'), { recursive: true, force: true });
  for (const { file } of entries) copyStripped(join(repoDir, 'spritesheets', file), join(outRoot, 'public', CHAR_PREFIX, file));
  copyStripped(join(tilesDir, selection.tiles.file), join(outRoot, 'public', catalog.tileset));
  for (const c of creatures) copyStripped(join(opts.creaturesDir!, c.file), join(outRoot, 'public', CREATURE_PREFIX, c.file.split('/').pop()!));
  const catalogPath = join(outRoot, 'data/appearance/catalog.json');
  mkdirSync(dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  writeFileSync(
    join(outRoot, 'CREDITS.md'),
    renderCreditsMd(
      entries,
      [selection.tiles.credit],
      creatures.map((c) => ({ ...c.credit, file: `creatures/${c.file.split('/').pop()}` })),
    ),
  );
}
