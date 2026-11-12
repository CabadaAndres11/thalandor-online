import { BALANCE, MONSTERS, type MonsterDef } from '../combat/defs';
import { refreshPlayerBase, type Unit } from '../combat/unit';
import type { World } from '../world';

const X = BALANCE.xp;
export const MAX_LEVEL = X.maxLevel;

/** Experience needed to go from `level` to the next one; 0 at the cap (GDD §4.7). */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.round(X.base * level ** X.exponent);
}

/** Experience a monster is worth before level and group adjustments. */
export function monsterXp(def: Pick<MonsterDef, 'level' | 'elite'>): number {
  return Math.round(X.monsterBase * def.level ** X.monsterExponent) * (def.elite ? X.eliteMultiplier : 1);
}

/** Reduction for monsters well below the player's level. */
export function levelFactor(playerLevel: number, monsterLevel: number): number {
  const d = playerLevel - monsterLevel;
  if (d <= X.levelGrace) return 1;
  return Math.max(X.minFactor, 1 - X.levelPenalty * (d - X.levelGrace));
}

/** What each of `n` sharing players gets from `total`. */
export function groupShare(total: number, n: number): number {
  return Math.round((total * (1 + X.groupBonusPerMember * (n - 1))) / n);
}

/** Adds experience, levelling up as many times as it allows (refills, event). */
export function awardXp(world: World, p: Unit, amount: number): void {
  if (p.kind !== 'player' || p.level >= MAX_LEVEL || amount <= 0) return;
  p.xp += amount;
  let levelled = false;
  while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    levelled = true;
    world.emit({ e: 'levelup', id: p.id, name: p.name, level: p.level });
  }
  if (p.level >= MAX_LEVEL) p.xp = 0;
  if (levelled) {
    refreshPlayerBase(p, world.now);
    p.hp = p.stats.maxHp;
    if (p.resourceKind !== 'rage') p.resource = p.stats.maxResource;
  }
}

/** Splits a dead monster's experience among the living players near it. */
export function shareXp(world: World, m: Unit): void {
  const def = m.monsterType ? MONSTERS[m.monsterType] : undefined;
  if (!def) return;
  const near = world
    .allPlayers()
    .filter((p) => p.state !== 'dead' && Math.hypot(p.pos.x - m.pos.x, p.pos.y - m.pos.y) <= X.shareRange);
  if (near.length === 0) return;
  const each = groupShare(monsterXp(def), near.length);
  for (const p of near) awardXp(world, p, Math.round(each * levelFactor(p.level, def.level)));
}
