import { MONSTERS } from '../combat/defs';
import { addPlayer, steps, testWorld } from '../combat/test-world';
import { CLASSES } from '../combat/defs';
import { playerBaseStats } from '../combat/stats';
import { awardXp, groupShare, levelFactor, MAX_LEVEL, monsterXp, xpToNext } from './xp';

test('curve: 100 * L^1.6 rounded, none at the cap', () => {
  expect(xpToNext(1)).toBe(100);
  expect(xpToNext(10)).toBe(Math.round(100 * 10 ** 1.6));
  expect(xpToNext(29)).toBe(Math.round(100 * 29 ** 1.6));
  expect(xpToNext(MAX_LEVEL)).toBe(0);
});

test('monster xp: 8 * level^1.2, x4 for elites', () => {
  expect(monsterXp(MONSTERS.skeleton!)).toBe(Math.round(8 * 2 ** 1.2));
  expect(monsterXp(MONSTERS.orc_elite!)).toBe(Math.round(8 * 5 ** 1.2) * 4);
});

test('level factor drops for monsters more than 2 levels below, floored at 10%', () => {
  expect(levelFactor(3, 1)).toBe(1);
  expect(levelFactor(4, 1)).toBeCloseTo(0.85, 9);
  expect(levelFactor(30, 1)).toBe(0.1);
  expect(levelFactor(1, 5)).toBe(1);
});

test('group share: total * (1 + 0.1 * (n - 1)) / n', () => {
  expect(groupShare(100, 1)).toBe(100);
  expect(groupShare(100, 4)).toBe(Math.round((100 * 1.3) / 4));
});

test('levelling up refills, raises stats with class growth and emits an event', () => {
  const w = testWorld();
  const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
  const hpAt1 = p.stats.maxHp;
  p.hp = 10;
  awardXp(w, p, 100);
  expect(p.level).toBe(2);
  expect(p.xp).toBe(0);
  expect(p.stats.maxHp).toBe(hpAt1 + 10); // +1 stamina from growth
  expect(p.hp).toBe(p.stats.maxHp);
  expect(w.drainEvents()).toContainEqual(expect.objectContaining({ e: 'levelup', id: p.id, level: 2 }));
  awardXp(w, p, 100000);
  expect(p.level).toBeGreaterThan(5);
});

test('xp stops at level 30', () => {
  const w = testWorld();
  const p = addPlayer(w, 'mage', { x: 300, y: 300 });
  awardXp(w, p, 10_000_000);
  expect(p.level).toBe(30);
  expect(p.xp).toBe(0);
});

test('killing a monster shares xp with nearby non-dead players only', () => {
  const w = testWorld();
  const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
  const b = addPlayer(w, 'cleric', { x: 340, y: 300 });
  const far = addPlayer(w, 'mage', { x: 300 + 900, y: 300 });
  const mob = w.addMonster('orc_elite', { x: 320, y: 340 });
  w.damage(mob, 99999, a, 'physical');
  const share = groupShare(monsterXp(MONSTERS.orc_elite!), 2);
  expect(a.xp + xpSpent(a)).toBe(share);
  expect(b.xp + xpSpent(b)).toBe(share);
  expect(far.xp).toBe(0);
});

test('xp ignores players who left', () => {
  const w = testWorld();
  const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
  const b = addPlayer(w, 'cleric', { x: 320, y: 300 });
  const mob = w.addMonster('skeleton', { x: 310, y: 330 });
  w.damage(mob, 5, b, 'physical');
  w.removePlayer(b.id);
  expect(() => w.damage(mob, 99999, a, 'physical')).not.toThrow();
  expect(a.xp + xpSpent(a)).toBe(monsterXp(MONSTERS.skeleton!));
  steps(w, 1);
});

test('allocated attributes add on top of base and growth', () => {
  const base = playerBaseStats(CLASSES.warrior!, 1, { strength: 0, agility: 0, intellect: 0, stamina: 0, spirit: 0 });
  const more = playerBaseStats(CLASSES.warrior!, 1, { strength: 0, agility: 0, intellect: 0, stamina: 3, spirit: 0 });
  expect(more.maxHp).toBe(base.maxHp + 30);
  const lvl5 = playerBaseStats(CLASSES.warrior!, 5, { strength: 0, agility: 0, intellect: 0, stamina: 0, spirit: 0 });
  expect(lvl5.maxHp).toBe(base.maxHp + 4 * 10);
  expect(lvl5.blockChance).toBeCloseTo((15 + 4) * 0.002, 9);
});

/** xp already converted into levels for a level-1 start. */
function xpSpent(u: { level: number }): number {
  let total = 0;
  for (let l = 1; l < u.level; l++) total += xpToNext(l);
  return total;
}
