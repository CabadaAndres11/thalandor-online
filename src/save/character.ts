import { defaultAppearance, isClassId, isValidAppearance, type Appearance, type ClassId } from '../appearance/catalog';
import type { Attributes } from '../sim/combat/defs';

export const CURRENT_SCHEMA = 2;
export const HOTBAR_SIZE = 4;
const ATTRS: (keyof Attributes)[] = ['strength', 'agility', 'intellect', 'stamina', 'spirit'];
export const MAX_CHARACTERS = 8;
export const NAME_MIN = 2;
export const NAME_MAX = 16;

const NAME_RE = /^[\p{L}\p{N} '\-]+$/u;

export interface Location {
  mapId: string;
  x: number;
  y: number;
}

/** Choices the player made while levelling (validated again by the host). */
export interface Progress {
  attributes: Attributes;
  /** Rank per talent node id. */
  talents: Record<string, number>;
  specId: string | null;
  /** Abilities on slots 1–4; null means "use the default". */
  hotbar: (string | null)[];
}

export function emptyProgress(): Progress {
  return {
    attributes: { strength: 0, agility: 0, intellect: 0, stamina: 0, spirit: 0 },
    talents: {},
    specId: null,
    hotbar: Array<string | null>(HOTBAR_SIZE).fill(null),
  };
}

export interface Character extends Progress {
  schemaVersion: 2;
  id: string;
  name: string;
  classId: ClassId;
  appearance: Appearance;
  level: number;
  xp: number;
  lastLocation: Location | null;
  createdAt: number;
  updatedAt: number;
}

export type NameError = 'name.tooShort' | 'name.tooLong' | 'name.invalidChars' | 'name.duplicate';
export type ParseError = 'import.invalid' | 'import.future';
type Migration = (c: Record<string, unknown>) => Record<string, unknown>;

/** Upgrades from version N to N+1. */
export const migrations: Record<number, Migration> = {
  // v2 (Plan 4): progress fields; parseCharacter fills them with defaults.
  1: (c) => ({ ...c, schemaVersion: 2 }),
};

export function validateName(name: string, existingNames: string[]): { ok: true; name: string } | { ok: false; error: NameError } {
  const trimmed = name.trim();
  const len = [...trimmed].length;
  if (len < NAME_MIN) return { ok: false, error: 'name.tooShort' };
  if (len > NAME_MAX) return { ok: false, error: 'name.tooLong' };
  if (!NAME_RE.test(trimmed)) return { ok: false, error: 'name.invalidChars' };
  const lower = trimmed.toLocaleLowerCase();
  if (existingNames.some((n) => n.toLocaleLowerCase() === lower)) return { ok: false, error: 'name.duplicate' };
  return { ok: true, name: trimmed };
}

export function createCharacter(
  input: { name: string; classId: ClassId; appearance: Appearance },
  now = Date.now(),
  id: string = crypto.randomUUID(),
): Character {
  return {
    schemaVersion: CURRENT_SCHEMA,
    id,
    name: input.name,
    classId: input.classId,
    appearance: input.appearance,
    level: 1,
    xp: 0,
    ...emptyProgress(),
    lastLocation: null,
    createdAt: now,
    updatedAt: now,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isCount = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0;

function parseProgress(c: Record<string, unknown>): Progress {
  const p = emptyProgress();
  const a = c.attributes;
  if (isObj(a) && ATTRS.every((k) => isCount(a[k]))) for (const k of ATTRS) p.attributes[k] = a[k] as number;
  if (isObj(c.talents)) for (const [k, v] of Object.entries(c.talents)) if (isCount(v) && v > 0) p.talents[k] = v;
  if (typeof c.specId === 'string') p.specId = c.specId;
  const h = c.hotbar;
  if (Array.isArray(h) && h.length === HOTBAR_SIZE && h.every((x) => x === null || typeof x === 'string')) p.hotbar = [...(h as (string | null)[])];
  return p;
}

function isLocation(v: unknown): v is Location {
  return isObj(v) && typeof v.mapId === 'string' && isNum(v.x) && isNum(v.y);
}

/** Validates unknown data (e.g. an imported file), migrating it to the current schema. */
export function parseCharacter(
  raw: unknown,
  migs: Record<number, Migration> = migrations,
): { ok: true; character: Character } | { ok: false; error: ParseError } {
  if (!isObj(raw) || !isNum(raw.schemaVersion)) return { ok: false, error: 'import.invalid' };
  if (raw.schemaVersion > CURRENT_SCHEMA) return { ok: false, error: 'import.future' };
  let c: Record<string, unknown> = raw;
  while ((c.schemaVersion as number) < CURRENT_SCHEMA) {
    const step = migs[c.schemaVersion as number];
    if (!step) return { ok: false, error: 'import.invalid' };
    c = step(c);
  }
  if (typeof c.id !== 'string' || c.id === '' || typeof c.name !== 'string' || !isClassId(c.classId)) return { ok: false, error: 'import.invalid' };
  if (!validateName(c.name, []).ok) return { ok: false, error: 'import.invalid' };
  if (!isNum(c.level) || !isNum(c.xp) || !isNum(c.createdAt) || !isNum(c.updatedAt)) return { ok: false, error: 'import.invalid' };
  if (c.lastLocation !== null && !isLocation(c.lastLocation)) return { ok: false, error: 'import.invalid' };
  const loc = c.lastLocation as Location | null;
  return {
    ok: true,
    character: {
      schemaVersion: CURRENT_SCHEMA,
      id: c.id,
      name: c.name.trim(),
      classId: c.classId,
      appearance: isValidAppearance(c.appearance) ? { ...c.appearance } : defaultAppearance(c.classId),
      level: c.level,
      xp: c.xp,
      ...parseProgress(c),
      lastLocation: loc ? { mapId: loc.mapId, x: loc.x, y: loc.y } : null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    },
  };
}
