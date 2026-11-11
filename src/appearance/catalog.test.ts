import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import es from '../../data/i18n/es.json';
import { CATALOG, CLASS_IDS, defaultAppearance, isValidAppearance, resolveLayers } from './catalog';

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

test('resolveLayers orders by zIndex and includes body, hair and class outfit', () => {
  const a = { body: 'female', skin: 'olive', hairStyle: 'long', hairColor: 'blonde' };
  const layers = resolveLayers('mage', a);
  const sheets = layers.map((l) => l.sheet);
  expect(sheets).toContain('assets/lpc/characters/body/bodies/female/walk.png');
  expect(sheets).toContain('assets/lpc/characters/hair/long/adult/walk.png');
  expect(sheets).toContain('assets/lpc/characters/torso/clothes/robe/female/walk/purple.png');
  const z = layers.map((l) => l.zIndex);
  expect(z).toEqual([...z].sort((x, y) => x - y));
});

test('resolveLayers differs by class', () => {
  const a = defaultAppearance('warrior');
  expect(resolveLayers('warrior', a)).not.toEqual(resolveLayers('cleric', a));
});

test('defaultAppearance is valid for every class', () => {
  for (const c of CLASS_IDS) expect(isValidAppearance(defaultAppearance(c))).toBe(true);
});

test('isValidAppearance rejects unknown ids and non-objects', () => {
  const ok = defaultAppearance('mage');
  expect(isValidAppearance({ ...ok, hairStyle: 'mohawk' })).toBe(false);
  expect(isValidAppearance({ ...ok, skin: 'green' })).toBe(false);
  expect(isValidAppearance({ ...ok, body: 'child' })).toBe(false);
  expect(isValidAppearance(null)).toBe(false);
  expect(isValidAppearance('x')).toBe(false);
  expect(isValidAppearance({ body: 'male' })).toBe(false);
});

test('every catalog sheet exists in public/', () => {
  const sheets = new Set<string>([CATALOG.tileset]);
  for (const ls of Object.values(CATALOG.layers.body)) for (const l of ls) sheets.add(l.sheet);
  for (const l of Object.values(CATALOG.layers.hair)) sheets.add(l.sheet);
  for (const byBody of Object.values(CATALOG.layers.outfit)) for (const ls of Object.values(byBody)) for (const l of ls) sheets.add(l.sheet);
  for (const s of sheets) expect(existsSync(PUBLIC + s), s).toBe(true);
});

test('every class has an outfit for every body', () => {
  for (const c of CLASS_IDS) for (const b of CATALOG.bodies) expect(CATALOG.layers.outfit[c]?.[b.id]?.length, `${c}/${b.id}`).toBeGreaterThan(0);
});

test('every labelKey exists in es.json', () => {
  const texts = es as Record<string, string>;
  const keys = [...CATALOG.bodies, ...CATALOG.skins, ...CATALOG.hairStyles, ...CATALOG.hairColors].map((o) => o.labelKey);
  for (const c of CLASS_IDS) keys.push(`class.${c}`, `class.${c}.role`);
  for (const k of keys) expect(texts[k], k).toBeTypeOf('string');
});
