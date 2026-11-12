import { sanitizeProgress } from './validate';

const attrs = (strength: number) => ({ strength, agility: 0, intellect: 0, stamina: 0, spirit: 0 });

test('missing progress means a fresh level 1 character', () => {
  expect(sanitizeProgress('warrior', undefined)).toEqual({
    progress: { level: 1, xp: 0, attributes: attrs(0), talents: {}, specId: null, hotbar: [null, null, null, null] },
    resets: [],
  });
});

test('coherent progress is kept', () => {
  const raw = { level: 4, xp: 50, attributes: attrs(15), talents: { might_1: 1, might_2: 1, might_3: 1 }, specId: null, hotbar: ['warrior_charge', null, null, null] };
  expect(sanitizeProgress('warrior', raw)).toEqual({ progress: raw, resets: [] });
});

test('too many attribute or talent points, impossible trees and foreign specs are reset', () => {
  const r = sanitizeProgress('warrior', { level: 3, xp: 0, attributes: attrs(11), talents: { might_3: 1 }, specId: 'mage_fire' });
  expect(r.progress.level).toBe(3);
  expect(r.progress.attributes).toEqual(attrs(0));
  expect(r.progress.talents).toEqual({});
  expect(r.progress.specId).toBeNull();
  expect(r.resets).toEqual(['attributes', 'talents', 'spec']);
});

test('bad level falls back to 1; xp is clamped below the next level', () => {
  expect(sanitizeProgress('mage', { level: 99 }).progress.level).toBe(1);
  expect(sanitizeProgress('mage', { level: 2.5 }).resets).toContain('level');
  expect(sanitizeProgress('mage', { level: 1, xp: 1e9 }).progress.xp).toBe(99);
});
