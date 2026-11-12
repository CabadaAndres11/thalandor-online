import type { Attributes, StatKey, StatMod } from '../combat/defs';
import { affixDef, itemBase, roundStat, type BaseStat, type EquipSlot, type GearItem, type Item } from './defs';

const ATTRS = new Set(['strength', 'agility', 'intellect', 'stamina', 'spirit']);

export type Equipment = Partial<Record<EquipSlot, GearItem | null>>;

/** The value of a base stat at an item level. */
export const baseStatValue = (s: BaseStat, level: number) => roundStat(s.stat, 'flat', (s.base ?? 0) + s.perLevel * level);

/** Every bonus of one item as {stat, flat|pct}; nothing when broken (durability 0). */
export function itemBonuses(item: GearItem): { stat: string; flat?: number; pct?: number }[] {
  const base = itemBase(item.baseId);
  if (!base || item.durability <= 0) return [];
  const out: { stat: string; flat?: number; pct?: number }[] = base.stats.map((s) => ({ stat: s.stat, flat: baseStatValue(s, item.level) }));
  for (const a of item.affixes) {
    const def = affixDef(a.id);
    if (def) out.push(def.mode === 'pct' ? { stat: def.stat, pct: a.value } : { stat: def.stat, flat: a.value });
  }
  return out;
}

/** What the equipped items add: attributes (before stats are derived) and stat modifiers. */
export function equipmentBonuses(eq: Equipment): { attrs: Attributes; mods: StatMod[] } {
  const attrs: Attributes = { strength: 0, agility: 0, intellect: 0, stamina: 0, spirit: 0 };
  const mods: StatMod[] = [];
  for (const item of Object.values(eq)) {
    if (!item) continue;
    for (const b of itemBonuses(item)) {
      if (ATTRS.has(b.stat) && b.flat !== undefined) attrs[b.stat as keyof Attributes] += b.flat;
      else mods.push({ stat: b.stat as StatKey, ...(b.flat !== undefined ? { flat: b.flat } : {}), ...(b.pct !== undefined ? { pct: b.pct } : {}) });
    }
  }
  return { attrs, mods };
}

/** Gear look per visible slot, for drawing the character. */
export function equipmentLooks(eq: Equipment): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slot, item] of Object.entries(eq) as [EquipSlot, Item | null][]) {
    if (!item || 'potion' in item) continue;
    const look = itemBase(item.baseId)?.look;
    if (look) out[slot] = look;
  }
  return out;
}
