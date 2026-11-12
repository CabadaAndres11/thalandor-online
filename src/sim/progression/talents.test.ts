import { CLASSES } from '../combat/defs';
import { playerBaseStats } from '../combat/stats';
import { canSpend, talentMods, TALENTS, talentPoints, validateTalents } from './talents';

test('data: centre, 10 spokes of 4, 5 keystones; links are symmetric', () => {
  const nodes = Object.entries(TALENTS.nodes);
  expect(nodes).toHaveLength(46);
  expect(nodes.filter(([, n]) => n.kind === 'keystone')).toHaveLength(5);
  expect(nodes.filter(([, n]) => n.kind === 'notable')).toHaveLength(10);
  for (const [id, n] of nodes) for (const l of n.links) expect(TALENTS.nodes[l]!.links, `${id}-${l}`).toContain(id);
  expect(TALENTS.nodes[TALENTS.start]!.links).toHaveLength(10);
});

test('keystones are 5 points from the centre', () => {
  const dist = new Map([[TALENTS.start, 0]]);
  const queue = [TALENTS.start];
  while (queue.length) {
    const id = queue.shift()!;
    for (const l of TALENTS.nodes[id]!.links) if (!dist.has(l)) dist.set(l, dist.get(id)! + 1) && queue.push(l);
  }
  for (const d of TALENTS.directions) expect(dist.get(`${d}_key`)).toBe(5);
});

test('points: level - 1', () => {
  expect(talentPoints(1)).toBe(0);
  expect(talentPoints(30)).toBe(29);
});

test('only nodes next to the centre or a bought node can be bought', () => {
  expect(canSpend({}, 'might_1', 2)).toBe(true);
  expect(canSpend({}, 'might_celerity_1', 2)).toBe(true);
  expect(canSpend({}, 'might_2', 30)).toBe(false);
  expect(canSpend({ might_1: 1 }, 'might_2', 30)).toBe(true);
  expect(canSpend({ might_1: 1, might_2: 1 }, 'might_3', 30)).toBe(true);
  // the third ring links neighbouring spokes
  expect(canSpend({ might_1: 1, might_2: 1, might_3: 1 }, 'might_celerity_3', 30)).toBe(true);
  expect(canSpend({}, 'start', 30)).toBe(false);
  expect(canSpend({ might_1: 1 }, 'might_1', 30)).toBe(false);
  expect(canSpend({ might_1: 1 }, 'might_2', 2)).toBe(false); // the only point is spent
  for (const bad of ['nope', '__proto__', 'constructor']) expect(canSpend({}, bad, 30)).toBe(false);
});

test('validateTalents: connected, within points, rank 1, real nodes', () => {
  expect(validateTalents({}, 1)).toBe(true);
  const path = { might_1: 1, might_2: 1, might_3: 1, might_4: 1, might_key: 1 };
  expect(validateTalents(path, 6)).toBe(true);
  expect(validateTalents(path, 5)).toBe(false);
  expect(validateTalents({ might_2: 1 }, 30)).toBe(false);
  expect(validateTalents({ might_1: 2 }, 30)).toBe(false);
  expect(validateTalents({ start: 1 }, 30)).toBe(false);
  expect(validateTalents({ ghost: 1 }, 30)).toBe(false);
  expect(validateTalents(JSON.parse('{"__proto__":1}'), 30)).toBe(false);
});

test('talentMods lists the bought nodes bonuses; hybrids mix both directions', () => {
  expect(talentMods({ might_1: 1, bastion_4: 1 })).toEqual([
    { stat: 'attackPower', pct: 0.03 },
    { stat: 'armor', flat: 15 },
  ]);
  expect(talentMods({ might_celerity_1: 1 }).map((m) => m.stat)).toEqual(['attackPower', 'moveSpeed']);
});

test('every talent modifies a real stat', () => {
  const known = new Set(Object.keys(playerBaseStats(CLASSES.warrior!)));
  for (const n of Object.values(TALENTS.nodes)) for (const m of n.mods) expect(known).toContain(m.stat);
});
