import texts from '../../../data/i18n/es.json';
import { CATALOG } from '../../appearance/catalog';
import { CLASSES } from '../combat/defs';
import { AFFIXES, affixRange, classCanUse, ITEM_BASES, itemValue, LOOT, sellPrice, type GearItem } from './defs';
import { basesFor, rollGear, rollItemFor, rollLoot, rollRarity } from './roll';
import { equipmentBonuses, equipmentLooks, itemBonuses } from './stats';
import { canWear, sanitizeBelongings, sanitizeItem } from './validate';

const T = texts as Record<string, string>;

/** Deterministic rng from a list (cycles). */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length]!;
};
const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('data', () => {
  test('every base has a name, a known look and stats that are real', () => {
    for (const b of Object.values(ITEM_BASES)) {
      expect(T[b.nameKey], b.id).toBeTruthy();
      if (b.look) expect(CATALOG.layers.gear[b.look]?.slot, b.id).toBe(b.slot);
      expect(b.minLevel).toBeLessThanOrEqual(b.maxLevel);
    }
  });

  test('every class can find gear for every slot at every level band', () => {
    for (const classId of Object.keys(CLASSES)) {
      for (const level of [1, 10, 20, 30]) {
        for (const slot of ['weapon', 'offhand', 'head', 'shoulders', 'chest', 'hands', 'legs', 'feet', 'neck', 'ring'] as const) {
          expect(basesFor(level, { classId, slot }).length, `${classId} ${level} ${slot}`).toBeGreaterThan(0);
        }
      }
    }
  });

  test('armour types follow the class (lower types allowed)', () => {
    const plate = ITEM_BASES.plate_chest_plate!;
    const cloth = ITEM_BASES.cloth_chest_shirt!;
    expect(classCanUse('warrior', plate)).toBe(true);
    expect(classCanUse('warrior', cloth)).toBe(true);
    expect(classCanUse('mage', plate)).toBe(false);
    expect(classCanUse('explorer', ITEM_BASES.mail_chest_hauberk!)).toBe(true);
    expect(classCanUse('explorer', plate)).toBe(false);
    expect(classCanUse('mage', ITEM_BASES.sword_arming!)).toBe(false);
    expect(classCanUse('mage', ITEM_BASES.staff_simple!)).toBe(true);
  });
});

describe('rolls', () => {
  test('rarity follows the table', () => {
    expect(rollRarity(false, seq(0.1))).toBe('common');
    expect(rollRarity(false, seq(0.6))).toBe('uncommon');
    expect(rollRarity(false, seq(0.9))).toBe('rare');
    expect(rollRarity(false, seq(0.99))).toBe('epic');
    expect(rollRarity(true, seq(0.1))).toBe('common');
    expect(rollRarity(true, seq(0.5))).toBe('uncommon');
  });

  test('affixes match the rarity, never repeat a stat and stay in range', () => {
    const rng = mulberry(3);
    for (let i = 0; i < 300; i++) {
      const base = Object.values(ITEM_BASES)[i % Object.keys(ITEM_BASES).length]!;
      const level = 1 + (i % 30);
      const it = rollGear(base, level, 'epic', rng);
      expect(it.affixes).toHaveLength(3);
      expect(new Set(it.affixes.map((a) => AFFIXES[a.id]!.stat)).size).toBe(3);
      for (const a of it.affixes) {
        const [lo, hi] = affixRange(AFFIXES[a.id]!, level);
        expect(a.value).toBeGreaterThanOrEqual(lo);
        expect(a.value).toBeLessThanOrEqual(hi);
      }
      expect(sanitizeItem(JSON.parse(JSON.stringify(it)))).toEqual(it);
    }
  });

  test('loot: elites always drop gear, normal monsters sometimes; usable share favours the class', () => {
    const rng = mulberry(9);
    let normalItems = 0;
    let usable = 0;
    let total = 0;
    for (let i = 0; i < 2000; i++) {
      const l = rollLoot('mage', 5, false, rng);
      normalItems += l.items.filter((x) => 'baseId' in x).length;
      const e = rollLoot('mage', 5, true, rng);
      const gear = e.items.filter((x): x is GearItem => 'baseId' in x);
      expect(gear.length).toBeGreaterThanOrEqual(1);
      for (const g of gear) {
        total++;
        if (classCanUse('mage', ITEM_BASES[g.baseId]!)) usable++;
        expect(g.level).toBe(5);
      }
    }
    expect(normalItems / 2000).toBeGreaterThan(0.08);
    expect(normalItems / 2000).toBeLessThan(0.16);
    expect(usable / total).toBeGreaterThan(0.7);
  });

  test('rollItemFor always returns a base for the level', () => {
    for (const lvl of [1, 15, 30]) expect(rollItemFor('explorer', lvl, false, mulberry(lvl))?.level).toBe(lvl);
  });
});

describe('stats and value', () => {
  const sword = (over: Partial<GearItem> = {}): GearItem => ({ uid: 'a1', baseId: 'sword_arming', level: 10, rarity: 'uncommon', affixes: [{ id: 'strength', value: 4 }], durability: 100, ...over });

  test('base stats scale with level; attributes and mods are split', () => {
    const b = equipmentBonuses({ weapon: sword() });
    expect(b.attrs.strength).toBe(Math.round(0.3 * 10) + 4);
    expect(b.mods).toEqual([{ stat: 'attackPower', flat: 4 + 2 * 10 }]);
  });

  test('a broken item gives nothing', () => {
    expect(itemBonuses(sword({ durability: 0 }))).toEqual([]);
  });

  test('value grows with level and rarity; sale is a quarter', () => {
    expect(itemValue(sword({ rarity: 'epic' })) / itemValue(sword({ rarity: 'common' }))).toBeCloseTo(8, 1);
    expect(itemValue(sword({ level: 20 }))).toBeGreaterThan(itemValue(sword()));
    expect(sellPrice(sword(), 1)).toBe(Math.floor(itemValue(sword()) * LOOT.sellFactor));
  });

  test('looks of equipped items', () => {
    expect(equipmentLooks({ weapon: sword(), ring1: { ...sword(), baseId: 'ring_gold' } })).toEqual({ weapon: 'weapon_arming_iron' });
  });
});

describe('validation', () => {
  const good: GearItem = { uid: 'abc123', baseId: 'plate_head_nasal', level: 5, rarity: 'common', affixes: [], durability: 80 };

  test('forged items are dropped on join', () => {
    const forged = [
      { ...good, baseId: 'excalibur' },
      { ...good, level: 99 },
      { ...good, durability: 150 },
      { ...good, rarity: 'uncommon' }, // affix count does not match
      { ...good, rarity: 'uncommon', affixes: [{ id: 'strength', value: 999 }] },
      { ...good, rarity: 'rare', affixes: [{ id: 'strength', value: 2 }, { id: 'strength', value: 2 }] },
      { ...good, rarity: 'uncommon', affixes: [{ id: 'moveSpeed', value: 0.01 }] }, // feet-only affix on a helmet
      { ...good, uid: '<script>' },
      { uid: 'p1', potion: 'mana', count: 1 },
      { uid: 'p2', potion: 'health', count: 99 },
    ];
    for (const f of forged) expect(sanitizeItem(f)).toBeNull();
    const b = sanitizeBelongings({ gold: -5, inventory: [good, good, ...forged], equipment: { head: { ...good, uid: 'zz' } } }, 'warrior', 5);
    expect(b.gold).toBe(0);
    expect(b.inventory.filter(Boolean)).toEqual([good]); // duplicate uid kept once
    expect(b.equipment.head?.uid).toBe('zz');
  });

  test('equipment the character cannot wear goes to the bag', () => {
    const b = sanitizeBelongings({ inventory: [], equipment: { head: good, chest: { ...good, uid: 'x2', baseId: 'cloth_chest_shirt', level: 3 } } }, 'mage', 3);
    expect(b.equipment.head).toBeUndefined(); // plate on a mage, and level 5 > 3
    expect(b.equipment.chest?.uid).toBe('x2');
    expect(b.inventory.filter(Boolean).map((i) => i!.uid)).toEqual(['abc123']);
  });

  test('canWear checks place, class and level', () => {
    expect(canWear(good, 'head', 'warrior', 5)).toBe(true);
    expect(canWear(good, 'head', 'warrior', 4)).toBe(false);
    expect(canWear(good, 'chest', 'warrior', 5)).toBe(false);
    expect(canWear({ ...good, baseId: 'ring_gold' }, 'ring2', 'mage', 30)).toBe(true);
  });
});
