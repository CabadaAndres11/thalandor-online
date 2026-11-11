import { isClassId, type Appearance, type ClassId } from '../appearance/catalog';
import type { EntityId, PlayerInput } from '../sim/types';
import type { WorldSnapshot } from '../sim/world';

/** What a client sends about its character when joining. The host validates class and appearance. */
export interface NetCharacter {
  name: string;
  classId: string;
  appearance: Appearance;
  lastLocation: { mapId: string; x: number; y: number } | null;
}

export interface RosterEntry {
  id: EntityId;
  name: string;
  classId: ClassId;
  appearance: Appearance;
}

export type ClientMessage =
  | { t: 'hello'; version: string; character: NetCharacter }
  | { t: 'input'; input: PlayerInput }
  | { t: 'chat'; text: string };

export type RejectReason = 'version' | 'full';

export type HostMessage =
  | { t: 'welcome'; playerId: EntityId; mapId: string }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'snapshot'; s: WorldSnapshot }
  | { t: 'roster'; players: RosterEntry[] }
  | { t: 'chat'; from: string; text: string }
  | { t: 'left'; playerId: EntityId; name: string };

export function encode(msg: ClientMessage | HostMessage): string {
  return JSON.stringify(msg);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function parse(raw: string): Obj | null {
  try {
    const v: unknown = JSON.parse(raw);
    return isObj(v) && isStr(v.t) ? v : null;
  } catch {
    return null;
  }
}

/** Numbers are only type-checked here; range sanitizing is the host's job (HostSession). */
const isInput = (v: unknown): v is PlayerInput =>
  isObj(v) && isNum(v.seq) && isNum(v.moveX) && isNum(v.moveY) && isNum(v.aimX) && isNum(v.aimY);

/** Shape only: whether the ids exist in the catalog is decided by the host. */
const isAppearanceShape = (v: unknown): v is Appearance =>
  isObj(v) && isStr(v.body) && isStr(v.skin) && isStr(v.hairStyle) && isStr(v.hairColor);

const isLocation = (v: unknown) => v === null || (isObj(v) && isStr(v.mapId) && isNum(v.x) && isNum(v.y));

const isNetCharacter = (v: unknown): v is NetCharacter =>
  isObj(v) && isStr(v.name) && isStr(v.classId) && isAppearanceShape(v.appearance) && isLocation(v.lastLocation);

const isSnapshot = (v: unknown): v is WorldSnapshot =>
  isObj(v) &&
  isNum(v.tick) &&
  Array.isArray(v.players) &&
  v.players.every(
    (p) => isObj(p) && isNum(p.id) && isStr(p.name) && isNum(p.x) && isNum(p.y) && isNum(p.lastInputSeq) && isNum(p.facing) && isBool(p.moving),
  );

const isRoster = (v: unknown): v is RosterEntry[] =>
  Array.isArray(v) && v.every((p) => isObj(p) && isNum(p.id) && isStr(p.name) && isClassId(p.classId) && isAppearanceShape(p.appearance));

export function decodeClient(raw: string): ClientMessage | null {
  const m = parse(raw);
  if (!m) return null;
  switch (m.t) {
    case 'hello':
      return isStr(m.version) && isNetCharacter(m.character) ? { t: 'hello', version: m.version, character: m.character } : null;
    case 'input':
      return isInput(m.input) ? { t: 'input', input: m.input } : null;
    case 'chat':
      return isStr(m.text) ? { t: 'chat', text: m.text } : null;
    default:
      return null;
  }
}

export function decodeHost(raw: string): HostMessage | null {
  const m = parse(raw);
  if (!m) return null;
  switch (m.t) {
    case 'welcome':
      return isNum(m.playerId) && isStr(m.mapId) ? { t: 'welcome', playerId: m.playerId, mapId: m.mapId } : null;
    case 'reject':
      return m.reason === 'version' || m.reason === 'full' ? { t: 'reject', reason: m.reason } : null;
    case 'snapshot':
      return isSnapshot(m.s) ? { t: 'snapshot', s: m.s } : null;
    case 'roster':
      return isRoster(m.players) ? { t: 'roster', players: m.players } : null;
    case 'chat':
      return isStr(m.from) && isStr(m.text) ? { t: 'chat', from: m.from, text: m.text } : null;
    case 'left':
      return isNum(m.playerId) && isStr(m.name) ? { t: 'left', playerId: m.playerId, name: m.name } : null;
    default:
      return null;
  }
}
