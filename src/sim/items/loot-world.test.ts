import { addPlayer, steps, testWorld } from '../combat/test-world';
import type { GearItem } from './defs';
import { LOOT } from './defs';
import { lootOf } from './loot-world';

const helm = (uid: string): GearItem => ({ uid, baseId: 'plate_head_nasal', level: 1, rarity: 'common', affixes: [], durability: 100 });

test('a killed elite drops personal loot for every nearby player', () => {
  const w = testWorld();
  const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
  const b = addPlayer(w, 'mage', { x: 340, y: 300 });
  const far = addPlayer(w, 'cleric', { x: 300 + 900, y: 300 });
  const m = w.addMonster('orc_elite', { x: 320, y: 340 });
  w.damage(m, 99999, a, 'physical');
  const events = w.drainEvents().filter((e) => e.e === 'loot');
  expect(events.map((e) => e.e === 'loot' && e.owner).sort()).toEqual([a.id, b.id].sort());
  expect(lootOf(w, a.id).some((d) => d.item)).toBe(true); // elites always drop an item
  expect(lootOf(w, far.id)).toEqual([]);
});

test('pickup only own loot in range', () => {
  const w = testWorld();
  const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
  const b = addPlayer(w, 'warrior', { x: 500, y: 300 });
  w.loot.push({ id: 1, ownerId: a.id, pos: { x: 500, y: 300 }, item: helm('h1'), expiresAt: 1e9 });
  w.loot.push({ id: 2, ownerId: a.id, pos: { x: 300, y: 305 }, gold: 7, expiresAt: 1e9 });
  steps(w, 1);
  // b stands on a's helmet: it stays; a picks up the gold under its feet
  expect(b.inventory.filter(Boolean)).toEqual([]);
  expect(a.gold).toBe(7);
  expect(w.loot.map((g) => g.id)).toEqual([1]);
  a.pos = { x: 480, y: 300 };
  steps(w, 1);
  expect(a.inventory[0]?.uid).toBe('h1');
  expect(w.loot).toEqual([]);
  expect(w.drainEvents().filter((e) => e.e === 'pickup').map((e) => e.e === 'pickup' && e.id)).toEqual([2, 1]);
});

test('a full bag leaves the item on the ground with one notice', () => {
  const w = testWorld();
  const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
  a.inventory.fill(helm('x'));
  w.loot.push({ id: 1, ownerId: a.id, pos: { x: 300, y: 300 }, item: helm('h1'), expiresAt: 1e9 });
  steps(w, 3);
  expect(w.loot).toHaveLength(1);
  expect(w.drainEvents().filter((e) => e.e === 'bagFull')).toHaveLength(1);
});

test('loot expires, and goes when its owner leaves', () => {
  const w = testWorld();
  const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
  w.loot.push({ id: 1, ownerId: a.id, pos: { x: 600, y: 300 }, gold: 1, expiresAt: w.now + LOOT.lootTtlMs });
  w.loot.push({ id: 2, ownerId: 999, pos: { x: 600, y: 300 }, gold: 1, expiresAt: 1e9 });
  steps(w, LOOT.lootTtlMs / 50 + 1);
  expect(w.loot).toEqual([]);
  expect(w.drainEvents().filter((e) => e.e === 'lootGone')).toHaveLength(1);
  w.loot.push({ id: 3, ownerId: a.id, pos: { x: 600, y: 300 }, gold: 1, expiresAt: 1e9 });
  w.removePlayer(a.id);
  expect(w.loot).toEqual([]);
});
