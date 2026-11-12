import type { Rng } from '../combat/damage';
import { CLASSES } from '../combat/defs';
import {
  AFFIXES,
  affixRange,
  classCanUse,
  ITEM_BASES,
  LOOT,
  POTIONS,
  RARITIES,
  roundStat,
  type GearItem,
  type ItemBase,
  type ItemSlot,
  type PotionItem,
  type Rarity,
} from './defs';

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;

/**
 * A unique id for an item. It must not come from the simulation rng: that one is seeded the same in
 * every session, so ids would repeat across sessions and the load-time dedupe would delete items.
 */
export function newUid(_rng?: Rng): string {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  let s = 'i';
  for (const b of bytes) s += (b % 36).toString(36);
  return s;
}

export function rollRarity(elite: boolean, rng: Rng): Rarity {
  const table = elite ? LOOT.rarity.elite : LOOT.rarity.normal;
  let r = rng();
  for (const rarity of RARITIES) {
    r -= table[rarity];
    if (r < 0) return rarity;
  }
  return 'common';
}

/** Bases that can drop at this level (optionally only for a class, or a slot). */
export function basesFor(level: number, opts: { classId?: string; slot?: ItemSlot } = {}): ItemBase[] {
  return Object.values(ITEM_BASES).filter(
    (b) => level >= b.minLevel && level <= b.maxLevel && (!opts.classId || classCanUse(opts.classId, b)) && (!opts.slot || b.slot === opts.slot),
  );
}

/** A random piece of equipment of this level and rarity. */
export function rollGear(base: ItemBase, level: number, rarity: Rarity, rng: Rng): GearItem {
  const count = LOOT.affixCount[rarity];
  const taken = new Set<string>();
  const affixes: GearItem['affixes'] = [];
  const pool = Object.values(AFFIXES).filter((a) => !a.slots || a.slots.includes(base.slot));
  while (affixes.length < count && pool.length) {
    const i = Math.floor(rng() * pool.length);
    const a = pool.splice(Math.min(i, pool.length - 1), 1)[0]!;
    if (taken.has(a.stat)) continue;
    taken.add(a.stat);
    const [lo, hi] = affixRange(a, level);
    affixes.push({ id: a.id, value: roundStat(a.stat, a.mode, lo + (hi - lo) * rng()) });
  }
  return { uid: newUid(rng), baseId: base.id, level, rarity, affixes, durability: 100 };
}

/** Item drop for one player: usually something the class can use. Null if nothing can drop at this level. */
export function rollItemFor(classId: string, level: number, elite: boolean, rng: Rng): GearItem | null {
  const usable = rng() < LOOT.items.usableShare;
  const pool = basesFor(level, usable ? { classId } : {});
  const list = pool.length ? pool : basesFor(level);
  if (!list.length) return null;
  return rollGear(pick(list, rng), level, rollRarity(elite, rng), rng);
}

export function rollGold(monsterLevel: number, elite: boolean, rng: Rng): number {
  const g = LOOT.gold;
  if (rng() >= g.chance && !elite) return 0;
  const v = 1 + g.variance * (2 * rng() - 1);
  return Math.max(1, Math.round(g.base * monsterLevel ** g.exponent * v * (elite ? g.eliteMultiplier : 1)));
}

export function newPotion(kind: (typeof POTIONS)[number], count: number, rng: Rng): PotionItem {
  return { uid: newUid(rng), potion: kind, count };
}

/** Everything one player gets from one monster. */
export function rollLoot(classId: string, monsterLevel: number, elite: boolean, rng: Rng): { gold: number; items: (GearItem | PotionItem)[] } {
  const items: (GearItem | PotionItem)[] = [];
  const level = Math.max(1, Math.min(30, monsterLevel));
  const n = elite ? LOOT.items.eliteGuaranteed + (rng() < LOOT.items.eliteExtraChance ? 1 : 0) : rng() < LOOT.items.normalChance ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const it = rollItemFor(classId, level, elite, rng);
    if (it) items.push(it);
  }
  // Rage classes cannot drink resource potions: they only get health ones.
  const rage = CLASSES[classId]?.resource === 'rage';
  if (rng() < LOOT.potionChance) items.push(newPotion(rage || rng() < 0.5 ? 'health' : 'resource', 1, rng));
  return { gold: rollGold(level, elite, rng), items };
}
