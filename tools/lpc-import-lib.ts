/**
 * Pure helpers for importing a curated subset of the LPC (Liberated Pixel Cup) art.
 * Source: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppearanceCatalog, LayerRef, Material, PaletteSet } from '../src/appearance/catalog-types';

export interface LpcCredit {
  file: string;
  authors: string[];
  licenses: string[];
  urls: string[];
}

export interface SelLayer {
  /** Path relative to the repo's spritesheets/ folder. */
  src: string;
  z: number;
  /** body/hair: recolored with the player's choice. */
  recolor?: 'body' | 'hair';
  /** Fixed cloth palette name (sheet drawn in the cloth base palette). */
  cloth?: string;
}

export interface LpcSelection {
  palettes: Record<Material, { file: string; base: string; choices: string[] }>;
  bodies: { id: string; layers: SelLayer[] }[];
  hairStyles: { id: string; src: string; z: number }[];
  outfits: Record<string, Record<string, SelLayer[]>>;
  tiles: { file: string; credit: LpcCredit };
}

const CHAR_PREFIX = 'assets/lpc/characters/';
const TILES_PREFIX = 'assets/lpc/tiles/';

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

export function readPalettes(repoDir: string, sel: LpcSelection): Record<Material, PaletteSet> {
  const out = {} as Record<Material, PaletteSet>;
  for (const material of Object.keys(sel.palettes) as Material[]) {
    const def = sel.palettes[material];
    const all = JSON.parse(readFileSync(join(repoDir, def.file), 'utf8')) as Record<string, string[]>;
    const pick = (name: string) => {
      const ramp = all[name];
      if (!ramp || ramp.length !== 6) throw new Error(`palette ${material}/${name} missing or not 6 colors`);
      return ramp.map((c) => c.toLowerCase());
    };
    const names = new Set([...def.choices]);
    for (const outfit of Object.values(sel.outfits)) {
      for (const layers of Object.values(outfit)) for (const l of layers) if (material === 'cloth' && l.cloth) names.add(l.cloth);
    }
    out[material] = { base: pick(def.base), colors: Object.fromEntries([...names].map((n) => [n, pick(n)])) };
  }
  return out;
}

function toLayer(l: SelLayer): LayerRef {
  const ref: LayerRef = { sheet: CHAR_PREFIX + l.src, zIndex: l.z };
  if (l.recolor) ref.recolor = { material: l.recolor };
  else if (l.cloth) ref.recolor = { material: 'cloth', palette: l.cloth };
  return ref;
}

export function buildCatalog(sel: LpcSelection, palettes: Record<Material, PaletteSet>): AppearanceCatalog {
  const swatch = (m: Material, id: string) => palettes[m].colors[id]![3]!;
  return {
    palettes,
    bodies: sel.bodies.map((b) => ({ id: b.id, labelKey: `appearance.body.${b.id}` })),
    skins: sel.palettes.body.choices.map((id) => ({ id, labelKey: `appearance.skin.${id}`, swatch: swatch('body', id) })),
    hairStyles: sel.hairStyles.map((h) => ({ id: h.id, labelKey: `appearance.hair.${h.id}` })),
    hairColors: sel.palettes.hair.choices.map((id) => ({ id, labelKey: `appearance.hairColor.${id}`, swatch: swatch('hair', id) })),
    layers: {
      body: Object.fromEntries(sel.bodies.map((b) => [b.id, b.layers.map(toLayer)])),
      hair: Object.fromEntries(sel.hairStyles.map((h) => [h.id, toLayer({ src: h.src, z: h.z, recolor: 'hair' })])),
      outfit: Object.fromEntries(
        Object.entries(sel.outfits).map(([cls, byBody]) => [cls, Object.fromEntries(Object.entries(byBody).map(([b, ls]) => [b, ls.map(toLayer)]))]),
      ),
    },
    tileset: TILES_PREFIX + sel.tiles.file.split('/').pop(),
  };
}

export function renderCreditsMd(entries: { file: string; credit: LpcCredit }[], extra: LpcCredit[]): string {
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
  return lines.join('\n');
}

function allSources(sel: LpcSelection): string[] {
  const set = new Set<string>();
  for (const b of sel.bodies) for (const l of b.layers) set.add(l.src);
  for (const h of sel.hairStyles) set.add(h.src);
  for (const byBody of Object.values(sel.outfits)) for (const ls of Object.values(byBody)) for (const l of ls) set.add(l.src);
  return [...set];
}

export function importLpc(opts: { repoDir: string; tilesDir: string; outRoot: string; selection: LpcSelection }): void {
  const { repoDir, tilesDir, outRoot, selection } = opts;
  const credits = readCredits(repoDir);
  const entries = allSources(selection).map((file) => {
    const credit = creditFor(file, credits);
    if (!credit) throw new Error(`No credit found for selected sheet: ${file}`);
    if (!existsSync(join(repoDir, 'spritesheets', file))) throw new Error(`Selected sheet not found: ${file}`);
    return { file, credit };
  });
  const catalog = buildCatalog(selection, readPalettes(repoDir, selection));
  // The output folder is fully generated: start clean so deselected sheets do not linger.
  rmSync(join(outRoot, 'public', 'assets', 'lpc'), { recursive: true, force: true });
  for (const { file } of entries) {
    const dest = join(outRoot, 'public', CHAR_PREFIX, file);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(repoDir, 'spritesheets', file), dest);
  }
  const tileDest = join(outRoot, 'public', catalog.tileset);
  mkdirSync(dirname(tileDest), { recursive: true });
  copyFileSync(join(tilesDir, selection.tiles.file), tileDest);
  const catalogPath = join(outRoot, 'data/appearance/catalog.json');
  mkdirSync(dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  writeFileSync(join(outRoot, 'CREDITS.md'), renderCreditsMd(entries, [selection.tiles.credit]));
}
