import type { Unit } from '../combat/unit';
import { rebuildPlayer } from '../combat/unit';
import type { World } from '../world';
import {
  EQUIP_SLOTS,
  isPotion,
  ITEM_RULES,
  itemBase,
  itemValue,
  LOOT,
  placesFor,
  potionPrice,
  sellPrice,
  type EquipSlot,
  type GearItem,
  type Item,
  type PotionKind,
} from './defs';
import { basesFor, newPotion, rollGear } from './roll';
import { canWear } from './validate';

export type ItemResult = 'ok' | 'invalid' | 'full' | 'gold' | 'level' | 'class' | 'far' | 'cooldown' | 'none';

/** One thing the merchant sells. Prices are for the asking player. */
export interface StockEntry {
  id: string;
  potion?: PotionKind;
  baseId?: string;
  price: number;
}

const changed = (world: World, u: Unit, stats = false) => {
  if (stats) rebuildPlayer(u, world.now);
  world.markInventory(u.id);
};

/** Puts an item in the bag (potions stack first). Returns false when there is no room. */
export function addItem(u: Unit, item: Item): boolean {
  if (isPotion(item)) {
    let left = item.count;
    for (const s of u.inventory) {
      if (!s || !isPotion(s) || s.potion !== item.potion || s.count >= LOOT.potion.stack) continue;
      const n = Math.min(left, LOOT.potion.stack - s.count);
      s.count += n;
      left -= n;
      if (left === 0) return true;
    }
    if (left > 0) {
      const free = u.inventory.indexOf(null);
      if (free < 0) {
        item.count = left;
        return false;
      }
      u.inventory[free] = { ...item, count: left };
    }
    return true;
  }
  const free = u.inventory.indexOf(null);
  if (free < 0) return false;
  u.inventory[free] = item;
  return true;
}

const validIndex = (u: Unit, i: number) => Number.isInteger(i) && i >= 0 && i < u.inventory.length;

/** Equips the item at a bag index; whatever was worn there takes its place in the bag. */
export function equipFromBag(world: World, u: Unit, index: number, place?: EquipSlot): ItemResult {
  if (!validIndex(u, index) || !u.classId) return 'invalid';
  const item = u.inventory[index];
  if (!item || isPotion(item)) return 'invalid';
  const base = itemBase(item.baseId);
  if (!base) return 'invalid';
  const places = placesFor(base);
  const target = place && places.includes(place) ? place : (places.find((p) => !u.equipment[p]) ?? places[0]!);
  if (item.level > u.level) return 'level';
  if (!canWear(item, target, u.classId, u.level)) return 'class';
  u.inventory[index] = u.equipment[target] ?? null;
  u.equipment[target] = item;
  changed(world, u, true);
  return 'ok';
}

export function unequip(world: World, u: Unit, place: EquipSlot): ItemResult {
  if (!(EQUIP_SLOTS as readonly string[]).includes(place)) return 'invalid';
  const item = u.equipment[place];
  if (!item) return 'none';
  const free = u.inventory.indexOf(null);
  if (free < 0) return 'full';
  u.inventory[free] = item;
  delete u.equipment[place];
  changed(world, u, true);
  return 'ok';
}

/** Drinks a potion of this kind (shared cooldown). */
export function usePotion(world: World, u: Unit, kind: PotionKind): ItemResult {
  if (u.state !== 'alive') return 'invalid';
  if (u.potionCdUntil > world.now) return 'cooldown';
  if (kind === 'resource' && u.resourceKind === 'rage') return 'invalid';
  const i = u.inventory.findIndex((s) => s && isPotion(s) && s.potion === kind);
  if (i < 0) return 'none';
  const stack = u.inventory[i] as Extract<Item, { potion: PotionKind }>;
  if (kind === 'health') world.heal(u, Math.round(u.stats.maxHp * LOOT.potion.healPct), u, 'nature');
  else u.resource = Math.min(u.stats.maxResource, u.resource + u.stats.maxResource * LOOT.potion.resourcePct);
  stack.count--;
  if (stack.count <= 0) u.inventory[i] = null;
  u.potionCdUntil = world.now + LOOT.potion.cooldownMs;
  changed(world, u);
  return 'ok';
}

/** Whether the unit stands close enough to the merchant. */
export function nearMerchant(world: World, u: Unit): boolean {
  const m = world.merchant;
  return !!m && Math.hypot(m.pos.x - u.pos.x, m.pos.y - u.pos.y) <= LOOT.merchant.range;
}

/** Opens or closes the merchant window (selling only works while it is open and near). */
export function setMerchant(world: World, u: Unit, open: boolean): ItemResult {
  if (open && !nearMerchant(world, u)) return 'far';
  u.atMerchant = open;
  changed(world, u);
  return 'ok';
}

/** What the merchant offers this player: potions and a few commons of the class at their level. */
export function merchantStock(u: Unit): StockEntry[] {
  const out: StockEntry[] = POTION_KINDS.filter((k) => k === 'health' || u.resourceKind !== 'rage').map((k) => ({ id: `potion_${k}`, potion: k, price: potionPrice(u.level) }));
  if (!u.classId) return out;
  const level = Math.max(1, Math.min(30, u.level));
  const seen = new Set<string>();
  // The class's own armour type first (a warrior is offered plate, not cloth).
  const own = ITEM_RULES.classes[u.classId]?.armor;
  const bases = basesFor(level, { classId: u.classId }).sort((x, y) => Number(y.kind === own) - Number(x.kind === own));
  for (const b of bases) {
    if (seen.has(b.slot) || out.length >= 2 + LOOT.merchant.stockCommons) continue;
    seen.add(b.slot);
    out.push({ id: b.id, baseId: b.id, price: Math.round(itemValue({ uid: 'x', baseId: b.id, level, rarity: 'common', affixes: [], durability: 100 }) * 1.0) });
  }
  return out;
}
const POTION_KINDS: PotionKind[] = ['health', 'resource'];

export function buy(world: World, u: Unit, stockId: string): ItemResult {
  if (!u.atMerchant || !nearMerchant(world, u)) return 'far';
  const entry = merchantStock(u).find((e) => e.id === stockId);
  if (!entry) return 'invalid';
  if (u.gold < entry.price) return 'gold';
  const item: Item = entry.potion
    ? newPotion(entry.potion, 1, world.rng)
    : rollGear(itemBase(entry.baseId!)!, Math.max(1, Math.min(30, u.level)), 'common', world.rng);
  if (!addItem(u, item)) return 'full';
  u.gold -= entry.price;
  changed(world, u);
  return 'ok';
}

export function sell(world: World, u: Unit, index: number): ItemResult {
  if (!u.atMerchant || !nearMerchant(world, u)) return 'far';
  if (!validIndex(u, index)) return 'invalid';
  const item = u.inventory[index];
  if (!item) return 'none';
  u.inventory[index] = null;
  u.gold += sellPrice(item, u.level);
  changed(world, u);
  return 'ok';
}

/** What repairing everything worn costs. */
export function repairCost(u: Unit): number {
  let cost = 0;
  for (const it of Object.values(u.equipment)) {
    if (!it || it.durability >= 100) continue;
    cost += Math.ceil(itemValue(it) * LOOT.repairFactor * ((100 - it.durability) / 100));
  }
  return cost;
}

export function repairAll(world: World, u: Unit): ItemResult {
  if (!u.atMerchant || !nearMerchant(world, u)) return 'far';
  const cost = repairCost(u);
  if (cost === 0) return 'none';
  if (u.gold < cost) return 'gold';
  u.gold -= cost;
  for (const it of Object.values(u.equipment)) if (it) it.durability = 100;
  changed(world, u, true);
  return 'ok';
}

/** Dying wears every equipped piece. */
export function wearOnDeath(world: World, u: Unit): void {
  let any = false;
  for (const it of Object.values(u.equipment) as (GearItem | undefined)[]) {
    if (!it || it.durability <= 0) continue;
    it.durability = Math.max(0, it.durability - LOOT.durabilityLossOnDeath);
    any = true;
  }
  if (any) changed(world, u, true);
}
