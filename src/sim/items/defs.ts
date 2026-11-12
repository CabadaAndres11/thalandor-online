import basesJson from '../../../data/items/bases.json';
import affixesJson from '../../../data/items/affixes.json';
import lootJson from '../../../data/items/loot.json';
import rulesJson from '../../../data/items/rules.json';

export type ItemSlot = 'weapon' | 'offhand' | 'head' | 'shoulders' | 'chest' | 'hands' | 'legs' | 'feet' | 'neck' | 'ring';
/** Where an item is worn: rings have two places. */
export const EQUIP_SLOTS = ['weapon', 'offhand', 'head', 'shoulders', 'chest', 'hands', 'legs', 'feet', 'neck', 'ring1', 'ring2'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];
export const RARITIES = ['common', 'uncommon', 'rare', 'epic'] as const;
export type Rarity = (typeof RARITIES)[number];
export const POTIONS = ['health', 'resource'] as const;
export type PotionKind = (typeof POTIONS)[number];

/** value = base + perLevel × level; `stat` is an attribute or a StatKey. */
export interface BaseStat {
  stat: string;
  base?: number;
  perLevel: number;
}

export interface ItemBase {
  id: string;
  nameKey: string;
  slot: ItemSlot;
  /** Armour type (cloth…plate), weapon type (sword…), off-hand type (shield…) or 'jewelry'. */
  kind: string;
  minLevel: number;
  maxLevel: number;
  /** Gear look id in the appearance catalog (none for jewellery and orbs). */
  look?: string;
  icon: string;
  stats: BaseStat[];
}

export interface AffixDef {
  id: string;
  stat: string;
  /** flat: added before percentages; pct: a percentage bonus. */
  mode: 'flat' | 'pct';
  base: number;
  perLevel: number;
  /** Only on these slots (any slot when absent). */
  slots?: ItemSlot[];
}

/** A piece of equipment as stored in the character. Stats are always recomputed from the data. */
export interface GearItem {
  uid: string;
  baseId: string;
  level: number;
  rarity: Rarity;
  affixes: { id: string; value: number }[];
  durability: number;
}

export interface PotionItem {
  uid: string;
  potion: PotionKind;
  count: number;
}

export type Item = GearItem | PotionItem;
export const isPotion = (i: Item): i is PotionItem => 'potion' in i;

const withIds = <T>(rec: Record<string, Omit<T, 'id'>>): Record<string, T> =>
  Object.fromEntries(Object.entries(rec).map(([id, v]) => [id, { ...v, id } as T]));

export const ITEM_BASES = withIds<ItemBase>(basesJson as unknown as Record<string, Omit<ItemBase, 'id'>>);
export const AFFIXES = withIds<AffixDef>(affixesJson as unknown as Record<string, Omit<AffixDef, 'id'>>);
export const LOOT = lootJson;
export const ITEM_RULES = rulesJson as { armorOrder: string[]; classes: Record<string, { armor: string; weapon: string[]; offhand: string[] }> };

export const itemBase = (id: string) => (Object.hasOwn(ITEM_BASES, id) ? ITEM_BASES[id] : undefined);
export const affixDef = (id: string) => (Object.hasOwn(AFFIXES, id) ? AFFIXES[id] : undefined);

/** Whether a class may wear this base (armour type, weapon or off-hand kind). Level is checked separately. */
export function classCanUse(classId: string, base: ItemBase): boolean {
  const r = ITEM_RULES.classes[classId];
  if (!r) return false;
  if (base.slot === 'weapon') return r.weapon.includes(base.kind);
  if (base.slot === 'offhand') return r.offhand.includes(base.kind);
  if (base.kind === 'jewelry') return true;
  const order = ITEM_RULES.armorOrder;
  const k = order.indexOf(base.kind);
  return k >= 0 && k <= order.indexOf(r.armor);
}

/** Which equipment places an item can go to. */
export function placesFor(base: ItemBase): EquipSlot[] {
  return base.slot === 'ring' ? ['ring1', 'ring2'] : [base.slot];
}

/** Integer stats are attributes, armour and powers; the rest are fractions. */
const FRACTION_STATS = new Set(['critChance', 'critDamage', 'dodgeChance', 'blockChance', 'cooldownReduction', 'lifesteal', 'hpRegen']);
export const roundStat = (stat: string, mode: 'flat' | 'pct', v: number) =>
  mode === 'pct' || FRACTION_STATS.has(stat) ? Math.round(v * 1000) / 1000 : Math.max(1, Math.round(v));

/** The [min, max] an affix can roll at an item level. */
export function affixRange(a: AffixDef, level: number): [number, number] {
  const full = a.base + a.perLevel * level;
  return [roundStat(a.stat, a.mode, full * LOOT.affixRoll.min), roundStat(a.stat, a.mode, full * LOOT.affixRoll.max)];
}

export function itemValue(item: Item, playerLevel = 1): number {
  if (isPotion(item)) return potionPrice(playerLevel) * item.count;
  const v = LOOT.value;
  return Math.round(v.base * item.level ** v.exponent * v.rarityMult[item.rarity]);
}

export const potionPrice = (playerLevel: number) => LOOT.potion.priceBase + LOOT.potion.pricePerLevel * playerLevel;
export const sellPrice = (item: Item, playerLevel: number) => Math.max(1, Math.floor(itemValue(item, playerLevel) * LOOT.sellFactor));
