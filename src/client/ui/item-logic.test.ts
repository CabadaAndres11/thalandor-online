import texts from '../../../data/i18n/es.json';
import { ITEM_BASES, type GearItem } from '../../sim/items/defs';
import { itemName, itemTooltip } from './item-logic';

const T = texts as Record<string, string>;
const helm = (over: Partial<GearItem> = {}): GearItem => ({ uid: 'a', baseId: 'plate_head_nasal', level: 5, rarity: 'uncommon', affixes: [{ id: 'stamina', value: 3 }], durability: 100, ...over });

test('names, slots, kinds and rarities have texts', () => {
  for (const b of Object.values(ITEM_BASES)) {
    expect(T[`slot.${b.slot}`], b.slot).toBeTruthy();
    expect(T[`kind.${b.kind}`], b.kind).toBeTruthy();
  }
  for (const r of ['common', 'uncommon', 'rare', 'epic']) expect(T[`rarity.${r}`]).toBeTruthy();
  expect(itemName({ uid: 'p', potion: 'health', count: 2 })).toBe(T['item.potion.health']);
});

test('tooltip shows rarity colour, stats, level requirement in red and a comparison', () => {
  const lines = itemTooltip(helm(), { level: 3, classId: 'warrior', equipment: { head: helm({ uid: 'b', rarity: 'common', affixes: [], level: 1 }) } });
  expect(lines[0]).toEqual({ text: T['item.plate_head_nasal'], color: '#5fd068' });
  expect(lines.some((l) => l.text.includes('Aguante') && l.color === '#5fd068')).toBe(true);
  expect(lines.find((l) => l.text.includes('5') && l.color === '#ff6a5a')).toBeDefined(); // requires level 5
  expect(lines.some((l) => l.text === T['item.compare'])).toBe(true);
});

test('items for another class say so', () => {
  expect(itemTooltip(helm(), { level: 30, classId: 'mage' }).some((l) => l.text === T['item.notForClass'])).toBe(true);
});
