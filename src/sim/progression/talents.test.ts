import { CLASSES } from '../combat/defs';
import { playerBaseStats } from '../combat/stats';
import { canSpend, talentMods, TALENTS, talentPoints, validateTalents } from './talents';

test('data: 5 routes x 6 nodes and 5 bridges; 16 points complete a route', () => {
  expect(Object.keys(TALENTS.nodes)).toHaveLength(30);
  expect(Object.keys(TALENTS.bridges)).toHaveLength(5);
  const might = Object.values(TALENTS.nodes).filter((n) => n.route === 'might');
  expect(might.reduce((a, n) => a + n.maxRank, 0)).toBe(16);
});

test('points: level - 1', () => {
  expect(talentPoints(1)).toBe(0);
  expect(talentPoints(30)).toBe(29);
});

test('tier requirements count points in lower tiers of the same route', () => {
  expect(canSpend({}, 'might_1a', 2)).toBe(true);
  expect(canSpend({}, 'might_2a', 30)).toBe(false);
  expect(canSpend({ might_1a: 3 }, 'might_2a', 30)).toBe(true);
  expect(canSpend({ might_1a: 3 }, 'might_3', 30)).toBe(false);
  expect(canSpend({ might_1a: 3, might_2a: 3 }, 'might_3', 30)).toBe(true);
  expect(canSpend({ might_1a: 3, might_1b: 3, might_2a: 3 }, 'might_4', 30)).toBe(true);
  // points in another route don't help
  expect(canSpend({ arcane_1a: 3 }, 'might_2a', 30)).toBe(false);
});

test('max rank and available points', () => {
  expect(canSpend({ might_1a: 3 }, 'might_1a', 30)).toBe(false);
  expect(canSpend({ might_1a: 1 }, 'might_1b', 2)).toBe(false); // level 2 = 1 point, already spent
  expect(canSpend({}, 'nope', 30)).toBe(false);
});

test('bridges need 3 points in each neighbour route and do not count for routes', () => {
  expect(canSpend({ might_1a: 3 }, 'bridge_might_celerity', 30)).toBe(false);
  expect(canSpend({ might_1a: 3, celerity_1a: 3 }, 'bridge_might_celerity', 30)).toBe(true);
  expect(validateTalents({ might_1a: 1, bridge_might_celerity: 2, might_2a: 1 }, 30)).toBe(false);
});

test('validateTalents accepts any reachable tree and rejects impossible ones', () => {
  expect(validateTalents({}, 1)).toBe(true);
  expect(validateTalents({ might_1a: 3, might_2a: 3, might_3: 1 }, 8)).toBe(true);
  expect(validateTalents({ might_1a: 3, might_2a: 3, might_3: 1 }, 7)).toBe(false); // 7 points, only 6
  expect(validateTalents({ might_2a: 3 }, 30)).toBe(false);
  expect(validateTalents({ might_1a: 4 }, 30)).toBe(false);
  expect(validateTalents({ ghost: 1 }, 30)).toBe(false);
  expect(validateTalents({ might_1a: 1.5 }, 30)).toBe(false);
});

test('talentMods multiplies per-rank mods by rank', () => {
  expect(talentMods({ might_1a: 2, bastion_3: 1 })).toEqual([
    { stat: 'attackPower', pct: 0.06 },
    { stat: 'armor', flat: 15 },
  ]);
});

test('every talent modifies a real stat', () => {
  const known = new Set(Object.keys(playerBaseStats(CLASSES.warrior!)));
  const all = [...Object.values(TALENTS.nodes), ...Object.values(TALENTS.bridges)];
  for (const n of all) for (const m of n.modsPerRank) expect(known).toContain(m.stat);
  for (const b of Object.values(TALENTS.bridges)) for (const r of b.routes) expect(TALENTS.routes).toContain(r);
});
