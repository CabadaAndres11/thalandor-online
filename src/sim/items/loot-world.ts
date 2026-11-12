import { MONSTERS } from '../combat/defs';
import type { Unit } from '../combat/unit';
import type { EntityId, Vec2 } from '../types';
import type { World } from '../world';
import { LOOT, type Item } from './defs';
import { addItem } from './inventory';
import { rollLoot } from './roll';

/** Something on the ground that only its owner sees and can pick up. */
export interface GroundLoot {
  id: number;
  ownerId: EntityId;
  pos: Vec2;
  item?: Item;
  gold?: number;
  expiresAt: number;
  /** The owner already got a "bag full" notice for it. */
  warned?: boolean;
}

/** What a client is told about one drop. */
export interface LootDrop {
  id: number;
  x: number;
  y: number;
  item?: Item;
  gold?: number;
}

const SHARE_RANGE = 800;

/** Each nearby living player gets its own drops scattered around the corpse. */
export function dropLoot(world: World, m: Unit): void {
  const def = m.monsterType ? MONSTERS[m.monsterType] : undefined;
  if (!def) return;
  for (const p of world.allPlayers()) {
    if (p.state === 'dead' || !p.classId || Math.hypot(p.pos.x - m.pos.x, p.pos.y - m.pos.y) > SHARE_RANGE) continue;
    const { gold, items } = rollLoot(p.classId, def.level, def.elite, world.rng);
    const drops: LootDrop[] = [];
    const place = (entry: Omit<GroundLoot, 'id' | 'ownerId' | 'pos' | 'expiresAt'>) => {
      const pos = scatter(world, m.pos);
      const g: GroundLoot = { id: world.nextLootId(), ownerId: p.id, pos, expiresAt: world.now + LOOT.lootTtlMs, ...entry };
      world.loot.push(g);
      drops.push({ id: g.id, x: pos.x, y: pos.y, ...(g.item ? { item: g.item } : {}), ...(g.gold ? { gold: g.gold } : {}) });
    };
    if (gold > 0) place({ gold });
    for (const item of items) place({ item });
    if (drops.length) world.emit({ e: 'loot', owner: p.id, drops });
  }
}

function scatter(world: World, at: Vec2): Vec2 {
  for (let i = 0; i < 8; i++) {
    const a = world.rng() * Math.PI * 2;
    const r = LOOT.lootScatter * (0.3 + 0.7 * world.rng());
    const p = { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r };
    if (world.isSpawnable(p, 4)) return p;
  }
  return { ...at };
}

/** Owners pick up what they walk over; old drops vanish. */
export function stepLoot(world: World): void {
  const now = world.now;
  const keep: GroundLoot[] = [];
  for (const g of world.loot) {
    const owner = world.getPlayer(g.ownerId);
    if (!owner || g.expiresAt <= now) {
      if (owner) world.emit({ e: 'lootGone', owner: g.ownerId, id: g.id });
      continue;
    }
    const near = owner.state === 'alive' && Math.hypot(owner.pos.x - g.pos.x, owner.pos.y - g.pos.y) <= LOOT.pickupRadius + owner.radius;
    if (!near) {
      keep.push(g);
      continue;
    }
    if (g.gold) {
      owner.gold += g.gold;
      world.markInventory(owner.id);
      world.emit({ e: 'pickup', owner: owner.id, id: g.id, gold: g.gold });
      continue;
    }
    if (g.item && addItem(owner, g.item)) {
      world.markInventory(owner.id);
      world.emit({ e: 'pickup', owner: owner.id, id: g.id, item: g.item });
      continue;
    }
    if (!g.warned) {
      g.warned = true;
      world.emit({ e: 'bagFull', owner: owner.id });
    }
    keep.push(g);
  }
  world.loot = keep;
}

/** Drops a player still has on the ground (sent when it joins late or reconnects). */
export function lootOf(world: World, ownerId: EntityId): LootDrop[] {
  return world.loot
    .filter((g) => g.ownerId === ownerId)
    .map((g) => ({ id: g.id, x: g.pos.x, y: g.pos.y, ...(g.item ? { item: g.item } : {}), ...(g.gold ? { gold: g.gold } : {}) }));
}
