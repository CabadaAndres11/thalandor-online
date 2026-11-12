import { BALANCE } from '../combat/defs';
import { ATTR_KEYS } from '../combat/stats';
import { freeAttrPoints, rebuildPlayer, type Unit } from '../combat/unit';
import type { Attributes } from '../combat/defs';
import type { World } from '../world';
import { canSpend, talentPoints } from './talents';
import { HOTBAR_SLOTS, resolveHotbar, SPECS, unlockedActives, UNLOCK } from './unlocks';
import { MAX_LEVEL, xpToNext } from './xp';

/** What a client may ask the host to change about its own character. */
export type ProgressRequest =
  | { k: 'attr'; attr: keyof Attributes }
  | { k: 'talent'; node: string }
  | { k: 'spec'; specId: string }
  | { k: 'resetTalents' }
  | { k: 'resetAttrs' }
  | { k: 'hotbar'; slot: number; abilityId: string | null };

export type RequestResult = 'ok' | 'invalid' | 'points' | 'combat' | 'level';

/** The player's progress as the host sees it (sent reliably to its owner). */
export interface ProgressInfo {
  level: number;
  xp: number;
  xpToNext: number;
  attributes: Attributes;
  freeAttrPoints: number;
  talents: Record<string, number>;
  freeTalentPoints: number;
  specId: string | null;
  /** Saved hotbar choice (what gets stored in the character). */
  hotbar: (string | null)[];
  /** What each slot casts right now. */
  slots: Record<'lmb' | 'rmb' | 's1' | 's2' | 's3' | 's4', string | null>;
  /** Actives that can go on the hotbar. */
  unlocked: string[];
  passives: string[];
  stats: Record<string, number>;
}

const SUMMARY_STATS = [
  'maxHp', 'maxResource', 'attackPower', 'spellPower', 'critChance', 'critDamage', 'dodgeChance', 'blockChance',
  'armor', 'moveSpeed', 'hpRegen', 'manaRegen', 'cooldownReduction', 'lifesteal',
] as const;

const inCombat = (world: World, u: Unit) => u.inCombatUntil > world.now || u.fightingUntil > world.now;
const spentTalents = (u: Unit) => Object.values(u.talents).reduce((a, b) => a + b, 0);

export function applyProgressRequest(world: World, u: Unit, req: ProgressRequest): RequestResult {
  if (u.kind !== 'player' || !u.classId) return 'invalid';
  switch (req.k) {
    case 'attr':
      if (!ATTR_KEYS.includes(req.attr)) return 'invalid';
      if (freeAttrPoints(u) <= 0) return 'points';
      u.attrs = { ...u.attrs, [req.attr]: u.attrs[req.attr] + 1 };
      break;
    case 'talent':
      if (!canSpend(u.talents, req.node, u.level)) return 'points';
      u.talents = { ...u.talents, [req.node]: (u.talents[req.node] ?? 0) + 1 };
      break;
    case 'spec': {
      const s = SPECS[req.specId];
      if (!s || s.classId !== u.classId) return 'invalid';
      if (u.level < UNLOCK.spec) return 'level';
      if (inCombat(world, u)) return 'combat';
      if (u.specId === req.specId) return 'ok';
      u.specId = req.specId;
      u.hotbar = [null, null, null, null];
      break;
    }
    case 'resetTalents':
      if (inCombat(world, u)) return 'combat';
      u.talents = {};
      break;
    case 'resetAttrs':
      if (inCombat(world, u)) return 'combat';
      u.attrs = { strength: 0, agility: 0, intellect: 0, stamina: 0, spirit: 0 };
      break;
    case 'hotbar': {
      if (!Number.isInteger(req.slot) || req.slot < 0 || req.slot >= HOTBAR_SLOTS.length) return 'invalid';
      if (req.abilityId !== null && !unlockedActives(u.classId, u.specId, u.level).includes(req.abilityId)) return 'invalid';
      const bar = resolveHotbar(u.classId, u.specId, u.level, u.hotbar);
      // Moving an ability that is already on another slot swaps the two slots.
      const from = req.abilityId ? bar.indexOf(req.abilityId) : -1;
      if (from >= 0) bar[from] = bar[req.slot] ?? null;
      bar[req.slot] = req.abilityId;
      u.hotbar = bar;
      break;
    }
  }
  rebuildPlayer(u, world.now);
  world.markProgress(u.id);
  return 'ok';
}

export function progressInfo(u: Unit): ProgressInfo {
  const classId = u.classId ?? '';
  const stats: Record<string, number> = {};
  for (const k of SUMMARY_STATS) stats[k] = Math.round(u.stats[k] * 1000) / 1000;
  return {
    level: u.level,
    xp: u.xp,
    xpToNext: xpToNext(u.level),
    attributes: { ...u.attrs },
    freeAttrPoints: freeAttrPoints(u),
    talents: { ...u.talents },
    freeTalentPoints: talentPoints(u.level) - spentTalents(u),
    specId: u.specId,
    hotbar: resolveHotbar(classId, u.specId, u.level, u.hotbar),
    slots: { ...u.slots },
    unlocked: unlockedActives(classId, u.specId, u.level),
    passives: u.passives.map((p) => p.id),
    stats,
  };
}

/** Development: set a level directly (xp reset), keeping choices that are still valid. */
export function devSetLevel(world: World, u: Unit, level: number): void {
  u.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  u.xp = 0;
  if (freeAttrPoints(u) < 0) u.attrs = { strength: 0, agility: 0, intellect: 0, stamina: 0, spirit: 0 };
  if (spentTalents(u) > talentPoints(u.level)) u.talents = {};
  if (u.level < UNLOCK.spec) u.specId = null;
  rebuildPlayer(u, world.now);
  u.hp = u.stats.maxHp;
  if (u.resourceKind !== 'rage') u.resource = u.stats.maxResource;
  world.markProgress(u.id);
}

export const ATTRIBUTE_POINTS_PER_LEVEL = BALANCE.progression.attributePointsPerLevel;
