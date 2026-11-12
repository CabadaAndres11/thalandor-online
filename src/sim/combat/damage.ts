import { BALANCE, type School } from './defs';

export type Rng = () => number;

/** Physical damage reduction from armor: armor / (armor + K), capped (GDD §5). */
export function mitigation(armor: number): number {
  const { armorK, armorCap } = BALANCE.combat;
  if (armor <= 0) return 0;
  return Math.min(armorCap, armor / (armor + armorK));
}

const varianceFactor = (r: number) => 1 + BALANCE.combat.variance * (2 * r - 1);

export interface DamageRoll {
  base: number;
  coef: number;
  power: number;
  school: School;
  armor: number;
  critChance: number;
  dodgeChance: number;
  dodgeable: boolean;
  /** Attacker damageDone * target damageTaken * other multipliers. */
  dmgMult: number;
  rng: Rng;
}

/** Rolls one hit. rng order: dodge, crit, variance. */
export function rollDamage(o: DamageRoll): { amount: number; crit: boolean; dodged: boolean } {
  if (o.dodgeable && o.rng() < o.dodgeChance) return { amount: 0, crit: false, dodged: true };
  if (!o.dodgeable) o.rng();
  const crit = o.rng() < o.critChance;
  let amount = (o.base + o.coef * o.power) * varianceFactor(o.rng()) * o.dmgMult;
  if (crit) amount *= BALANCE.combat.critMultiplier;
  if (o.school === 'physical') amount *= 1 - mitigation(o.armor);
  return { amount: Math.max(1, Math.round(amount)), crit, dodged: false };
}

/** Rolls a heal. rng order: crit, variance. */
export function rollHeal(o: { base: number; coef: number; power: number; critChance: number; healMult: number; rng: Rng }): {
  amount: number;
  crit: boolean;
} {
  const crit = o.rng() < o.critChance;
  let amount = (o.base + o.coef * o.power) * varianceFactor(o.rng()) * o.healMult;
  if (crit) amount *= BALANCE.combat.critMultiplier;
  return { amount: Math.max(0, Math.round(amount)), crit };
}
