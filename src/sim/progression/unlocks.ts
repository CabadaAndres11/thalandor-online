import specsJson from '../../../data/specs.json';
import { CLASSES, type PassiveDef, type Slot } from '../combat/defs';

export interface SpecDef {
  id: string;
  classId: string;
  nameKey: string;
  descKey: string;
  /** Unlocked at UNLOCK.specActives levels, in order. */
  actives: string[];
  /** Unlocked at UNLOCK.specPassives levels, in order. */
  passives: PassiveDef[];
  /** Abilities that replace a base slot (Assassin: left click). */
  replaces?: Partial<Record<Slot, string>>;
}

export const SPECS: Record<string, SpecDef> = Object.fromEntries(
  Object.entries(specsJson as Record<string, Omit<SpecDef, 'id'>>).map(([id, s]) => [id, { ...s, id }]),
);

/** Level at which each thing becomes available (GDD §4.3, spec of Plan 4). */
export const UNLOCK = {
  baseSlots: { lmb: 1, rmb: 1, s1: 1, s2: 3, s3: 6 } as Record<'lmb' | 'rmb' | 's1' | 's2' | 's3', number>,
  classPassives: [5, 15],
  spec: 10,
  specActives: [10, 16, 22],
  specPassives: [10, 20, 30],
} as const;

export const HOTBAR_SLOTS = ['s1', 's2', 's3', 's4'] as const;
export type HotbarSlot = (typeof HOTBAR_SLOTS)[number];
export type Loadout = Record<Exclude<Slot, 'dodge'>, string | null>;

export const specsOf = (classId: string) => Object.values(SPECS).filter((s) => s.classId === classId);

/** A spec usable by this class at this level, or null. */
export function validSpec(classId: string, specId: string | null, level: number): SpecDef | null {
  const s = specId ? SPECS[specId] : undefined;
  return s && s.classId === classId && level >= UNLOCK.spec ? s : null;
}

/** Active abilities the player may put on the hotbar (slots 1–4), in unlock order. */
export function unlockedActives(classId: string, specId: string | null, level: number): string[] {
  const c = CLASSES[classId];
  if (!c) return [];
  const out: string[] = [];
  for (const slot of ['s1', 's2', 's3'] as const) {
    const id = c.slots[slot];
    if (id && level >= UNLOCK.baseSlots[slot]) out.push(id);
  }
  const spec = validSpec(classId, specId, level);
  spec?.actives.forEach((id, i) => {
    if (level >= (UNLOCK.specActives[i] ?? Infinity)) out.push(id);
  });
  return out;
}

/** Class passives (5, 15) and spec passives (10, 20, 30) that are active at this level. */
export function activePassives(classId: string, specId: string | null, level: number): PassiveDef[] {
  const c = CLASSES[classId];
  if (!c) return [];
  const out = c.passives.filter((_, i) => level >= (UNLOCK.classPassives[i] ?? Infinity));
  const spec = validSpec(classId, specId, level);
  spec?.passives.forEach((p, i) => {
    if (level >= (UNLOCK.specPassives[i] ?? Infinity)) out.push(p);
  });
  return out;
}

/** Base abilities on 1–3 and the first spec ability on 4, as far as they are unlocked. */
export function defaultHotbar(classId: string, specId: string | null, level: number): (string | null)[] {
  const c = CLASSES[classId];
  const spec = validSpec(classId, specId, level);
  const unlocked = new Set(unlockedActives(classId, specId, level));
  const wanted = [c?.slots.s1, c?.slots.s2, c?.slots.s3, spec?.actives[0]];
  return wanted.map((id) => (id && unlocked.has(id) ? id : null));
}

/** The saved hotbar where it is still valid, the default elsewhere; no ability twice. */
export function resolveHotbar(classId: string, specId: string | null, level: number, saved: (string | null)[]): (string | null)[] {
  const unlocked = new Set(unlockedActives(classId, specId, level));
  const def = defaultHotbar(classId, specId, level);
  const out = HOTBAR_SLOTS.map((_, i) => {
    const s = saved[i];
    return s && unlocked.has(s) ? s : null;
  });
  for (let i = 0; i < out.length; i++) {
    const d = def[i];
    if (out[i] === null && d && !out.includes(d)) out[i] = d;
  }
  return out.map((id, i) => (id && out.indexOf(id) === i ? id : null));
}

/** What each input slot casts. */
export function loadout(classId: string, specId: string | null, level: number, hotbar: (string | null)[]): Loadout {
  const c = CLASSES[classId];
  const spec = validSpec(classId, specId, level);
  const bar = resolveHotbar(classId, specId, level, hotbar);
  return {
    lmb: spec?.replaces?.lmb ?? c?.slots.lmb ?? null,
    rmb: spec?.replaces?.rmb ?? c?.slots.rmb ?? null,
    s1: bar[0] ?? null,
    s2: bar[1] ?? null,
    s3: bar[2] ?? null,
    s4: bar[3] ?? null,
  };
}
