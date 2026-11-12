import { CLASSES } from '../combat/defs';
import { activePassives, defaultHotbar, loadout, resolveHotbar, unlockedActives, validSpec } from './unlocks';

const w = CLASSES.warrior!.slots;

test('base abilities unlock at 1, 3 and 6', () => {
  expect(unlockedActives('warrior', null, 1)).toEqual([w.s1]);
  expect(unlockedActives('warrior', null, 3)).toEqual([w.s1, w.s2]);
  expect(unlockedActives('warrior', null, 6)).toEqual([w.s1, w.s2, w.s3]);
});

test('class passives unlock at 5 and 15', () => {
  const ids = (l: number) => activePassives('warrior', null, l).map((p) => p.id);
  expect(ids(4)).toEqual([]);
  expect(ids(5)).toEqual([CLASSES.warrior!.passives[0]!.id]);
  expect(ids(15)).toHaveLength(2);
});

test('default hotbar and loadout at level 1', () => {
  expect(defaultHotbar('warrior', null, 1)).toEqual([w.s1, null, null, null]);
  expect(loadout('warrior', null, 1, [null, null, null, null])).toEqual({ lmb: w.lmb, rmb: w.rmb, s1: w.s1, s2: null, s3: null, s4: null });
});

test('saved hotbar keeps valid choices, drops locked or foreign ones, never duplicates', () => {
  expect(resolveHotbar('warrior', null, 6, [w.s3, w.s1, null, null])).toEqual([w.s3, w.s1, null, null]);
  expect(resolveHotbar('warrior', null, 1, [w.s3, 'mage_blink', null, null])).toEqual([w.s1, null, null, null]);
  expect(resolveHotbar('warrior', null, 6, [w.s2, w.s2, null, null])).toEqual([w.s2, null, w.s3, null]);
});

test('unknown or foreign specs are ignored', () => {
  expect(validSpec('warrior', 'nope', 30)).toBeNull();
});
