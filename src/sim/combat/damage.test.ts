import { mitigation, rollDamage, rollHeal } from './damage';

const fixed = (v: number) => () => v;
/** rng returning the given values in order. */
const seq = (...vs: number[]) => {
  let i = 0;
  return () => vs[i++ % vs.length]!;
};

const base = { base: 10, coef: 1, power: 20, school: 'physical' as const, armor: 0, critChance: 0, dodgeChance: 0, dodgeable: true, dmgMult: 1 };

test('mitigation is armor/(armor+100) capped at 75%', () => {
  expect(mitigation(100)).toBeCloseTo(0.5, 9);
  expect(mitigation(0)).toBe(0);
  expect(mitigation(100000)).toBe(0.75);
});

test('no variance at rng 0.5, damage = base + coef * power', () => {
  // rng order: dodge roll, crit roll, variance roll
  expect(rollDamage({ ...base, rng: seq(0.99, 0.99, 0.5) })).toEqual({ amount: 30, crit: false, dodged: false });
});

test('variance stays within +-10%', () => {
  expect(rollDamage({ ...base, rng: seq(0.99, 0.99, 0) }).amount).toBe(27);
  expect(rollDamage({ ...base, rng: seq(0.99, 0.99, 0.999999) }).amount).toBe(33);
});

test('armor only reduces physical damage', () => {
  expect(rollDamage({ ...base, armor: 100, rng: seq(0.99, 0.99, 0.5) }).amount).toBe(15);
  expect(rollDamage({ ...base, armor: 100, school: 'fire', rng: seq(0.99, 0.99, 0.5) }).amount).toBe(30);
});

test('crit multiplies by 1.5', () => {
  expect(rollDamage({ ...base, critChance: 1, rng: seq(0.99, 0, 0.5) })).toEqual({ amount: 45, crit: true, dodged: false });
});

test('dodge avoids dodgeable hits only', () => {
  expect(rollDamage({ ...base, dodgeChance: 1, rng: fixed(0) })).toEqual({ amount: 0, crit: false, dodged: true });
  expect(rollDamage({ ...base, dodgeChance: 1, dodgeable: false, rng: seq(0.99, 0.99, 0.5) }).dodged).toBe(false);
});

test('damage multiplier applies and minimum is 1', () => {
  expect(rollDamage({ ...base, dmgMult: 1.2, rng: seq(0.99, 0.99, 0.5) }).amount).toBe(36);
  expect(rollDamage({ ...base, base: 0, coef: 0, rng: seq(0.99, 0.99, 0.5) }).amount).toBe(1);
});

test('heal uses power, crit and heal multiplier', () => {
  expect(rollHeal({ base: 10, coef: 1, power: 10, critChance: 0, healMult: 1.1, rng: seq(0.99, 0.5) })).toEqual({ amount: 22, crit: false });
  expect(rollHeal({ base: 10, coef: 1, power: 10, critChance: 1, healMult: 1, rng: seq(0, 0.5) })).toEqual({ amount: 30, crit: true });
});
