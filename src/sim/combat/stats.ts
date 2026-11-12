import { PLAYER_SPEED } from '../constants';
import { BALANCE, type Attributes, type ClassDef, type StatKey, type StatMod } from './defs';

export type Stats = Record<StatKey, number>;

const MULTIPLIERS: StatKey[] = ['healingReceived', 'healingDone', 'damageDone', 'damageTaken'];

export const NO_ATTRS: Attributes = { strength: 0, agility: 0, intellect: 0, stamina: 0, spirit: 0 };
export const ATTR_KEYS: readonly (keyof Attributes)[] = ['strength', 'agility', 'intellect', 'stamina', 'spirit'];

/** Class attributes at a level: base + growth × (level − 1) + allocated points. */
export function totalAttributes(c: ClassDef, level: number, allocated: Attributes = NO_ATTRS): Attributes {
  const out = { ...NO_ATTRS };
  for (const k of ATTR_KEYS) out[k] = c.attributes[k] + (c.growth[k] ?? 0) * (level - 1) + allocated[k];
  return out;
}

/** Base stats of a class at a level with allocated attributes (GDD §4.4, constants in data/balance.json). */
export function playerBaseStats(c: ClassDef, level = 1, allocated: Attributes = NO_ATTRS): Stats {
  const k = BALANCE.stats;
  const a = totalAttributes(c, level, allocated);
  const maxResource = c.resource === 'mana' ? k.baseMana + a.intellect * k.manaPerIntellect : c.resource === 'none' ? 0 : 100;
  const s: Stats = {
    maxHp: k.baseHealth + a.stamina * k.healthPerStamina,
    maxResource,
    attackPower: a.strength * k.attackPowerPerStrength + a.agility * k.attackPowerPerAgility,
    spellPower: a.intellect * k.spellPowerPerIntellect,
    critChance: k.baseCritPct + a.agility * k.critPctPerAgility,
    dodgeChance: a.agility * k.dodgePctPerAgility,
    armor: c.armor,
    moveSpeed: PLAYER_SPEED,
    hpRegen: a.spirit * k.healthRegenPerSpirit,
    manaRegen: a.spirit * k.manaRegenPerSpirit,
    healingReceived: 1,
    healingDone: 1,
    damageDone: 1,
    damageTaken: 1,
    critDamage: 0,
    cooldownReduction: 0,
    lifesteal: 0,
    blockChance: a.strength * k.blockPctPerStrength,
    threatMultiplier: 1,
  };
  return s;
}

/** Base stats of a monster before group scaling. */
export function monsterBaseStats(m: { maxHp: number; armor: number; power: number; moveSpeed: number }): Stats {
  const s = Object.fromEntries(MULTIPLIERS.map((k) => [k, 1])) as Partial<Stats>;
  return {
    ...(s as Stats),
    maxHp: m.maxHp,
    maxResource: 0,
    attackPower: m.power,
    spellPower: m.power,
    critChance: BALANCE.stats.baseCritPct,
    dodgeChance: 0,
    armor: m.armor,
    moveSpeed: m.moveSpeed,
    hpRegen: 0,
    manaRegen: 0,
    critDamage: 0,
    cooldownReduction: 0,
    lifesteal: 0,
    blockChance: 0,
    threatMultiplier: 1,
  };
}

/** final = (base + sum of flat bonuses) * (1 + sum of percentage bonuses) (GDD §4.6). */
export function computeStats(base: Stats, mods: StatMod[]): Stats {
  const flat: Partial<Record<StatKey, number>> = {};
  const pct: Partial<Record<StatKey, number>> = {};
  for (const m of mods) {
    if (m.flat) flat[m.stat] = (flat[m.stat] ?? 0) + m.flat;
    if (m.pct) pct[m.stat] = (pct[m.stat] ?? 0) + m.pct;
  }
  const out = { ...base };
  for (const key of Object.keys(base) as StatKey[]) {
    out[key] = (base[key] + (flat[key] ?? 0)) * (1 + (pct[key] ?? 0));
  }
  return out;
}
