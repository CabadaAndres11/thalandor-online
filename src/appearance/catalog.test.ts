import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import es from '../../data/i18n/es.json';
import { allLayers, CATALOG, CLASS_IDS, defaultAppearance, isValidAppearance, monsterLayers, resolveLayers } from './catalog';

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
  for (const ls of Object.values(CATALOG.layers.monster)) for (const l of ls) sheets.add(l.sheet);
  for (const c of Object.values(CATALOG.creatures)) sheets.add(c.sheet);
  for (const l of allLayers()) for (const a of Object.values(l.anims ?? {})) sheets.add(a.sheet);
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

test('every class has slash/spellcast/shoot/thrust coverage for its body and the monsters exist', () => {
  const layers = resolveLayers('warrior', defaultAppearance('warrior'));
  expect(layers.find((l) => l.sheet.includes('bodies/male/walk'))?.anims?.slash).toBeDefined();
  expect(resolveLayers('explorer', defaultAppearance('explorer')).some((l) => l.actionOnly && l.anims?.shoot)).toBe(true);
  for (const id of ['skeleton', 'goblin', 'orc']) expect(monsterLayers(id).length).toBeGreaterThan(2);
  expect(CATALOG.creatures.bat?.frameSize).toBe(64);
  expect(monsterLayers('nope')).toEqual([]);
});

test('oversize anim sheets have a frame size above 64', () => {
  const sword = resolveLayers('warrior', defaultAppearance('warrior')).find((l) => l.sheet.includes('sword/arming/universal/fg'));
  expect(sword?.anims?.slash?.frameSize).toBe(128);
});

describe('equipment looks', () => {
  test('an equipped look replaces the class outfit layers of its slot only', () => {
    const a = defaultAppearance('warrior');
    const base = resolveLayers('warrior', a);
    const withHelm = resolveLayers('warrior', a, { head: 'head_nasal_iron', chest: 'chest_plate_gold' });
    const sheets = (ls: { sheet: string }[]) => ls.map((l) => l.sheet);
    expect(sheets(withHelm)).toContain('assets/lpc/characters/hat/helmet/nasal/adult/walk.png');
    expect(sheets(withHelm).some((s) => s.includes('torso/armour/plate'))).toBe(true);
    expect(sheets(withHelm).some((s) => s.includes('torso/armour/leather'))).toBe(false);
    // legs, feet and weapon stay as the class default
    for (const s of sheets(base).filter((s) => !s.includes('torso/'))) expect(sheets(withHelm)).toContain(s);
  });

  test('unknown looks or looks in the wrong slot are ignored', () => {
    const a = defaultAppearance('mage');
    expect(resolveLayers('mage', a, { head: 'nope', chest: 'head_nasal_iron' })).toEqual(resolveLayers('mage', a));
  });

  test('every look has layers for every body and its sheets exist', () => {
    for (const [id, g] of Object.entries(CATALOG.layers.gear)) {
      for (const b of CATALOG.bodies) {
        const ls = g.bodies[b.id];
        expect(ls?.length, `${id}/${b.id}`).toBeGreaterThan(0);
        for (const l of ls!) {
          expect(existsSync(`public/${l.sheet}`), l.sheet).toBe(true);
          if (l.recolor?.palette) expect(CATALOG.palettes[l.recolor.material].colors[l.recolor.palette], `${id} ${l.recolor.palette}`).toBeDefined();
        }
      }
    }
  });
});
