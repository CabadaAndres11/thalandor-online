import { affixDef, affixRange, classCanUse, EQUIP_SLOTS, isPotion, itemBase, LOOT, placesFor, POTIONS, RARITIES, type EquipSlot, type GearItem, type Item } from './defs';
import type { Equipment } from './stats';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const UID_RE = /^[a-z0-9]{1,24}$/i;

/** An item from untrusted data (client hello, imported save), or null if anything is impossible. */
export function sanitizeItem(raw: unknown): Item | null {
  if (!isObj(raw) || typeof raw.uid !== 'string' || !UID_RE.test(raw.uid)) return null;
  if ('potion' in raw) {
    if (!(POTIONS as readonly unknown[]).includes(raw.potion) || !isInt(raw.count, 1, LOOT.potion.stack)) return null;
    return { uid: raw.uid, potion: raw.potion as (typeof POTIONS)[number], count: raw.count };
  }
  const base = typeof raw.baseId === 'string' ? itemBase(raw.baseId) : undefined;
  if (!base || !isInt(raw.level, 1, 30) || !(RARITIES as readonly unknown[]).includes(raw.rarity) || !isInt(raw.durability, 0, 100)) return null;
  const rarity = raw.rarity as GearItem['rarity'];
  if (!Array.isArray(raw.affixes) || raw.affixes.length !== LOOT.affixCount[rarity]) return null;
  const affixes: GearItem['affixes'] = [];
  const stats = new Set<string>();
  for (const a of raw.affixes) {
    const def = isObj(a) && typeof a.id === 'string' ? affixDef(a.id) : undefined;
    if (!def || typeof a.value !== 'number' || !Number.isFinite(a.value)) return null;
    if (def.slots && !def.slots.includes(base.slot)) return null;
    if (stats.has(def.stat)) return null;
    const [lo, hi] = affixRange(def, raw.level);
    if (a.value < lo - 1e-9 || a.value > hi + 1e-9) return null;
    stats.add(def.stat);
    affixes.push({ id: def.id, value: a.value });
  }
  return { uid: raw.uid, baseId: base.id, level: raw.level, rarity, affixes, durability: raw.durability };
}

export interface Belongings {
  gold: number;
  inventory: (Item | null)[];
  equipment: Equipment;
}

/**
 * Untrusted inventory, equipment and gold from a joining client. Impossible items are dropped,
 * duplicated uids kept once, and equipped items the character cannot wear go to the bag (or are lost if it is full).
 */
export function sanitizeBelongings(raw: unknown, classId: string, level: number): Belongings {
  const r = isObj(raw) ? raw : {};
  const size = LOOT.inventorySize;
  const seen = new Set<string>();
  const once = (it: Item | null) => {
    if (!it || seen.has(it.uid)) return null;
    seen.add(it.uid);
    return it;
  };
  const equipment: Equipment = {};
  const toBag: Item[] = [];
  const rawEq = isObj(r.equipment) ? r.equipment : {};
  for (const slot of EQUIP_SLOTS) {
    const it = once(sanitizeItem(rawEq[slot]));
    if (!it) continue;
    if (!isPotion(it) && canWear(it, slot, classId, level)) equipment[slot] = it;
    else toBag.push(it);
  }
  const inventory: (Item | null)[] = Array<Item | null>(size).fill(null);
  const rawInv = Array.isArray(r.inventory) ? r.inventory.slice(0, size) : [];
  rawInv.forEach((x, i) => (inventory[i] = once(sanitizeItem(x))));
  for (const it of toBag) {
    const free = inventory.indexOf(null);
    if (free >= 0) inventory[free] = it;
  }
  const gold = isInt(r.gold, 0, 1e9) ? r.gold : 0;
  return { gold, inventory, equipment };
}

/** Whether this character may wear this item in this place. */
export function canWear(item: GearItem, slot: EquipSlot, classId: string, level: number): boolean {
  const base = itemBase(item.baseId);
  return !!base && placesFor(base).includes(slot) && classCanUse(classId, base) && item.level <= level;
}
