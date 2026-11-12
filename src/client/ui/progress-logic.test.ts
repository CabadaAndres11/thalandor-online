import texts from '../../../data/i18n/es.json';
import { TALENTS } from '../../sim/progression/talents';
import { describeMod, formatStat, talentLayout, talentTooltip } from './progress-logic';

const T = texts as Record<string, string>;

test('describeMod formats percentages, flat values and inverted stats', () => {
  expect(describeMod({ stat: 'attackPower', pct: 0.03 })).toBe('+3 % poder de ataque');
  expect(describeMod({ stat: 'attackPower', pct: 0.03 }, 3)).toBe('+9 % poder de ataque');
  expect(describeMod({ stat: 'damageTaken', pct: -0.02 })).toBe('−2 % daño recibido');
  expect(describeMod({ stat: 'armor', flat: 15 })).toBe('+15 armadura');
  expect(describeMod({ stat: 'critChance', flat: 0.01 })).toBe('+1 % probabilidad de crítico');
  expect(describeMod({ stat: 'cooldownReduction', flat: 0.03 })).toBe('−3 % recargas');
  expect(describeMod({ stat: 'hpRegen', flat: 0.5 })).toBe('+0,5 vida por segundo');
});

test('every talent has a name and a tooltip; layout is 5 routes of 2/2/1/1', () => {
  for (const id of [...Object.keys(TALENTS.nodes), ...Object.keys(TALENTS.bridges)]) {
    expect(T[`talent.${id}`], id).toBeTruthy();
    expect(talentTooltip(id)).toContain(T[`talent.${id}`]!);
  }
  for (const r of TALENTS.routes) expect(T[`route.${r}`], r).toBeTruthy();
  const layout = talentLayout();
  expect(layout.map((c) => c.tiers.map((t) => t.length))).toEqual(Array(5).fill([2, 2, 1, 1]));
});

test('formatStat shows fractions as percentages', () => {
  expect(formatStat('critChance', 0.075)).toBe('7,5 %');
  expect(formatStat('armor', 30)).toBe('30');
});
