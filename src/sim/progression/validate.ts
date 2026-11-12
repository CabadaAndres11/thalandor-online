import { BALANCE } from '../combat/defs';
import { ATTR_KEYS, NO_ATTRS } from '../combat/stats';
import type { PlayerProgress } from '../combat/unit';
import { validateTalents, type TalentAlloc } from './talents';
import { validSpec } from './unlocks';
import { MAX_LEVEL, xpToNext } from './xp';

export type ProgressReset = 'level' | 'attributes' | 'talents' | 'spec';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * Makes untrusted progress from a joining client coherent with its level. Parts that cannot
 * be right are reset (the player still joins); `resets` says which.
 */
export function sanitizeProgress(classId: string, raw: unknown): { progress: PlayerProgress; resets: ProgressReset[] } {
  const r = isObj(raw) ? raw : {};
  const resets: ProgressReset[] = [];
  let level = 1;
  if (isCount(r.level) && r.level >= 1 && r.level <= MAX_LEVEL) level = r.level;
  else if (r.level !== undefined) resets.push('level');
  const xp = isCount(r.xp) ? Math.min(r.xp, Math.max(0, xpToNext(level) - 1)) : 0;

  let attributes = { ...NO_ATTRS };
  const a = r.attributes;
  if (a !== undefined) {
    const ok = isObj(a) && ATTR_KEYS.every((k) => isCount(a[k]));
    const sum = ok ? ATTR_KEYS.reduce((s, k) => s + (a[k] as number), 0) : Infinity;
    if (ok && sum <= BALANCE.progression.attributePointsPerLevel * (level - 1)) {
      for (const k of ATTR_KEYS) attributes[k] = a[k] as number;
    } else {
      attributes = { ...NO_ATTRS };
      resets.push('attributes');
    }
  }

  let talents: TalentAlloc = {};
  if (r.talents !== undefined) {
    if (isObj(r.talents) && validateTalents(r.talents as TalentAlloc, level)) {
      talents = Object.fromEntries(Object.entries(r.talents as TalentAlloc).filter(([, v]) => v > 0));
    } else resets.push('talents');
  }

  let specId: string | null = null;
  if (r.specId !== undefined && r.specId !== null) {
    if (typeof r.specId === 'string' && validSpec(classId, r.specId, level)) specId = r.specId;
    else resets.push('spec');
  }

  const h = r.hotbar;
  const hotbar = [0, 1, 2, 3].map((i) => (Array.isArray(h) && typeof h[i] === 'string' ? (h[i] as string) : null));
  return { progress: { level, xp, attributes, talents, specId, hotbar }, resets };
}
