import { CLASSES } from './defs';
import { computeStats, playerBaseStats } from './stats';

test('warrior base stats follow the balance conversions', () => {
  const s = playerBaseStats(CLASSES.warrior!);
  expect(s.maxHp).toBe(100 + 14 * 10);
  expect(s.maxResource).toBe(100);
  expect(s.attackPower).toBe(15 * 2 + 8 * 1);
  expect(s.armor).toBe(60);
  expect(s.critChance).toBeCloseTo(0.05 + 8 * 0.005, 9);
  expect(s.moveSpeed).toBe(120);
  expect(s.damageDone).toBe(1);
});

test('mage mana comes from intellect', () => {
  expect(playerBaseStats(CLASSES.mage!).maxResource).toBe(100 + 16 * 10);
});

test('final = (base + flats) * (1 + sum of pcts), pcts add up', () => {
  const base = playerBaseStats(CLASSES.warrior!);
  const s = computeStats(base, [
    { stat: 'armor', flat: 40 },
    { stat: 'armor', pct: 0.1 },
    { stat: 'armor', pct: 0.1 },
    { stat: 'damageDone', pct: 0.15 },
  ]);
  expect(s.armor).toBeCloseTo((60 + 40) * 1.2, 9);
  expect(s.damageDone).toBeCloseTo(1.15, 9);
  expect(s.maxHp).toBe(base.maxHp);
});
