import { affixDef, classCanUse, isPotion, itemBase, placesFor, type EquipSlot, type Item } from '../../sim/items/defs';
import { itemBonuses, type Equipment } from '../../sim/items/stats';
import { t } from '../i18n';
import { describeMod } from './progress-logic';

export const RARITY_COLOR: Record<string, string> = { common: '#e8e4d8', uncommon: '#5fd068', rare: '#4a90f0', epic: '#b06af0', potion: '#e8e4d8' };

export const POTION_ICON: Record<string, string> = { health: 'drop:#d04040', resource: 'drop:#4060d0' };

export function itemName(item: Item): string {
  if (isPotion(item)) return t(`item.potion.${item.potion}`);
  const base = itemBase(item.baseId);
  return base ? t(base.nameKey) : item.baseId;
}

export const itemIcon = (item: Item) => (isPotion(item) ? POTION_ICON[item.potion]! : (itemBase(item.baseId)?.icon ?? 'star:#888888'));
export const itemColor = (item: Item) => RARITY_COLOR[isPotion(item) ? 'potion' : item.rarity]!;

export interface TipLine {
  text: string;
  color?: string;
}

/** Sums each bonus by stat key so two items can be compared. */
function bonusMap(item: Item | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!item || isPotion(item)) return out;
  for (const b of itemBonuses(item)) {
    const key = `${b.stat}|${b.pct !== undefined ? 'pct' : 'flat'}`;
    out.set(key, (out.get(key) ?? 0) + (b.pct ?? b.flat ?? 0));
  }
  return out;
}

const describe = (key: string, v: number) => {
  const [stat, mode] = key.split('|') as [string, string];
  return describeMod(mode === 'pct' ? { stat: stat as never, pct: v } : { stat: stat as never, flat: v });
};
const ATTR = new Set(['strength', 'agility', 'intellect', 'stamina', 'spirit']);
const attrText = (stat: string, v: number) => `${v > 0 ? '+' : '−'}${Math.abs(v)} ${t(`attr.${stat}`)}`;
const line = (key: string, v: number) => {
  const stat = key.split('|')[0]!;
  return ATTR.has(stat) && key.endsWith('flat') ? attrText(stat, v) : describe(key, v);
};

/** Tooltip lines: name, type, stats, durability, level requirement and the change against what is worn. */
export function itemTooltip(item: Item, ctx: { level: number; classId: string; equipment?: Equipment; price?: string }): TipLine[] {
  const lines: TipLine[] = [{ text: itemName(item), color: itemColor(item) }];
  if (isPotion(item)) {
    lines.push({ text: t(`item.potion.${item.potion}.desc`) }, { text: t('item.count', { n: item.count }) });
    if (ctx.price) lines.push({ text: ctx.price, color: '#e0c060' });
    return lines;
  }
  const base = itemBase(item.baseId);
  if (!base) return lines;
  lines.push({ text: `${t(`rarity.${item.rarity}`)} · ${t(`slot.${base.slot}`)} · ${t(`kind.${base.kind}`)}`, color: '#a39a85' });
  const own = bonusMap({ ...item, durability: 100 });
  for (const [key, v] of own) lines.push({ text: line(key, v), color: item.affixes.some((a) => key.startsWith(`${affixDef(a.id)?.stat}|`)) ? '#5fd068' : undefined });
  lines.push({ text: t('item.durability', { n: item.durability }), color: item.durability === 0 ? '#ff6a5a' : '#a39a85' });
  lines.push({ text: t('item.level', { n: item.level }), color: item.level > ctx.level ? '#ff6a5a' : '#a39a85' });
  if (!classCanUse(ctx.classId, base)) lines.push({ text: t('item.notForClass'), color: '#ff6a5a' });
  if (ctx.equipment) {
    const worn = placesFor(base)
      .map((p) => ctx.equipment![p as EquipSlot])
      .find(Boolean);
    if (worn && worn.uid !== item.uid) {
      const theirs = bonusMap(worn);
      const keys = new Set([...own.keys(), ...theirs.keys()]);
      const diffs: TipLine[] = [];
      for (const k of keys) {
        const d = Math.round(((own.get(k) ?? 0) - (theirs.get(k) ?? 0)) * 1000) / 1000;
        if (d !== 0) diffs.push({ text: line(k, d), color: d > 0 ? '#5fd068' : '#ff6a5a' });
      }
      if (diffs.length) lines.push({ text: t('item.compare'), color: '#a39a85' }, ...diffs);
    }
  }
  if (ctx.price) lines.push({ text: ctx.price, color: '#e0c060' });
  return lines;
}
