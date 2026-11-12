import { addPlayer, testWorld } from '../combat/test-world';
import { devSetLevel } from '../progression/requests';
import type { GearItem, PotionItem } from './defs';
import { LOOT } from './defs';
import { addItem, buy, equipFromBag, merchantStock, repairAll, repairCost, sell, setMerchant, unequip, usePotion, wearOnDeath } from './inventory';

const gear = (over: Partial<GearItem> = {}): GearItem => ({ uid: `g${Math.random().toString(36).slice(2, 8)}`, baseId: 'plate_head_nasal', level: 1, rarity: 'common', affixes: [], durability: 100, ...over });
const potion = (count = 1, kind: 'health' | 'resource' = 'health'): PotionItem => ({ uid: `p${count}${kind}`, potion: kind, count });

function setup(classId: 'warrior' | 'mage' = 'warrior') {
  const w = testWorld();
  w.merchant = { pos: { x: 340, y: 300 }, name: 'Mercader' };
  const p = addPlayer(w, classId, { x: 300, y: 300 });
  return { w, p };
}

test('equipping adds stats and swaps with what was worn; unequipping needs room', () => {
  const { w, p } = setup();
  const armor = p.stats.armor;
  addItem(p, gear());
  expect(equipFromBag(w, p, 0)).toBe('ok');
  expect(p.equipment.head?.baseId).toBe('plate_head_nasal');
  expect(p.stats.armor).toBeGreaterThan(armor);
  addItem(p, gear({ uid: 'second', baseId: 'plate_head_barbuta' }));
  expect(equipFromBag(w, p, 0)).toBe('ok');
  expect(p.equipment.head?.uid).toBe('second');
  expect(p.inventory[0]?.uid).not.toBe('second');
  p.inventory.fill(gear());
  expect(unequip(w, p, 'head')).toBe('full');
  p.inventory[3] = null;
  expect(unequip(w, p, 'head')).toBe('ok');
  expect(p.equipment.head).toBeUndefined();
  expect(w.drainInventory()).toContain(p.id);
});

test('cannot equip above level, another class type, or a potion', () => {
  const { w, p } = setup('mage');
  addItem(p, gear()); // plate on a mage
  addItem(p, gear({ baseId: 'cloth_head_hood', level: 4 }));
  addItem(p, potion());
  expect(equipFromBag(w, p, 0)).toBe('class');
  expect(equipFromBag(w, p, 1)).toBe('level');
  expect(equipFromBag(w, p, 2)).toBe('invalid');
  expect(equipFromBag(w, p, 99)).toBe('invalid');
  devSetLevel(w, p, 4);
  expect(equipFromBag(w, p, 1)).toBe('ok');
});

test('rings fill the free ring place first', () => {
  const { w, p } = setup();
  addItem(p, gear({ uid: 'r1', baseId: 'ring_copper' }));
  addItem(p, gear({ uid: 'r2', baseId: 'ring_copper' }));
  equipFromBag(w, p, 0);
  equipFromBag(w, p, 1);
  expect([p.equipment.ring1?.uid, p.equipment.ring2?.uid]).toEqual(['r1', 'r2']);
});

test('potions stack to 20, heal with a shared cooldown', () => {
  const { w, p } = setup();
  addItem(p, potion(15));
  addItem(p, potion(10));
  expect(p.inventory.filter(Boolean).map((s) => (s as PotionItem).count)).toEqual([20, 5]);
  p.hp = 10;
  expect(usePotion(w, p, 'health')).toBe('ok');
  expect(p.hp).toBe(10 + Math.round(p.stats.maxHp * LOOT.potion.healPct));
  expect(usePotion(w, p, 'health')).toBe('cooldown');
  expect(usePotion(w, p, 'resource')).toBe('cooldown');
  p.potionCdUntil = 0;
  expect(usePotion(w, p, 'resource')).toBe('invalid'); // rage has no potion
});

test('sell needs the merchant', () => {
  const { w, p } = setup();
  addItem(p, gear());
  expect(sell(w, p, 0)).toBe('far');
  expect(setMerchant(w, p, true)).toBe('ok');
  p.pos = { x: 600, y: 300 };
  expect(sell(w, p, 0)).toBe('far');
  expect(setMerchant(w, p, true)).toBe('far');
  p.pos = { x: 300, y: 300 };
  expect(sell(w, p, 0)).toBe('ok');
  expect(p.gold).toBeGreaterThan(0);
  expect(p.inventory[0]).toBeNull();
});

test('no duplication on repeated requests', () => {
  const { w, p } = setup();
  addItem(p, gear());
  setMerchant(w, p, true);
  expect(sell(w, p, 0)).toBe('ok');
  const gold = p.gold;
  expect(sell(w, p, 0)).toBe('none');
  expect(p.gold).toBe(gold);
  addItem(p, gear({ uid: 'eq' }));
  expect(equipFromBag(w, p, 0)).toBe('ok');
  expect(equipFromBag(w, p, 0)).toBe('invalid');
  expect(unequip(w, p, 'head')).toBe('ok');
  expect(unequip(w, p, 'head')).toBe('none');
  expect(p.inventory.filter((i) => i?.uid === 'eq')).toHaveLength(1);
});

test('buy: potions and class commons, gold checked', () => {
  const { w, p } = setup('mage');
  setMerchant(w, p, true);
  const stock = merchantStock(p);
  expect(stock.map((s) => s.id)).toContain('potion_health');
  expect(stock.map((s) => s.id)).toContain('potion_resource');
  expect(stock.length).toBeGreaterThan(2);
  expect(buy(w, p, 'potion_health')).toBe('gold');
  p.gold = 1000;
  expect(buy(w, p, 'potion_health')).toBe('ok');
  const commonId = stock.find((s) => s.baseId)!.id;
  expect(buy(w, p, commonId)).toBe('ok');
  expect(p.gold).toBe(1000 - stock.find((s) => s.id === 'potion_health')!.price - stock.find((s) => s.id === commonId)!.price);
  expect(buy(w, p, 'excalibur')).toBe('invalid');
});

test('dying wears equipment; at 0 it gives nothing; repair restores it for gold', () => {
  const { w, p } = setup();
  addItem(p, gear());
  equipFromBag(w, p, 0);
  const armor = p.stats.armor;
  for (let i = 0; i < 10; i++) wearOnDeath(w, p);
  expect(p.equipment.head?.durability).toBe(0);
  expect(p.stats.armor).toBeLessThan(armor);
  setMerchant(w, p, true);
  const cost = repairCost(p);
  expect(cost).toBeGreaterThan(0);
  expect(repairAll(w, p)).toBe('gold');
  p.gold = cost;
  expect(repairAll(w, p)).toBe('ok');
  expect(p.gold).toBe(0);
  expect(p.equipment.head?.durability).toBe(100);
  expect(p.stats.armor).toBe(armor);
});

test('a real death (not downed) wears equipment', () => {
  const { w, p } = setup();
  addItem(p, gear());
  equipFromBag(w, p, 0);
  w.damage(p, 99999, null, 'arcane');
  expect(p.state).toBe('dead');
  expect(p.equipment.head?.durability).toBe(100 - LOOT.durabilityLossOnDeath);
});

test('the merchant offers the class own armour type first', () => {
  const { p } = setup('warrior');
  const kinds = merchantStock(p).filter((s) => s.baseId).map((s) => s.baseId!.split('_')[0]);
  expect(kinds.every((k) => k === 'plate' || k === 'sword' || k === 'axe' || k === 'mace' || k === 'shield')).toBe(true);
});
