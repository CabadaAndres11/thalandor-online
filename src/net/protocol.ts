import { isClassId, type Appearance, type ClassId } from '../appearance/catalog';
import type { InventoryInfo, ProgressInfo, ProgressRequest, RequestResult } from '../sim/progression/requests';
import { EQUIP_SLOTS, POTIONS } from '../sim/items/defs';
import type { EntityId, PlayerInput, Press } from '../sim/types';
import type { MeSnapshot, UnitSnapshot, WorldSnapshot } from '../sim/world';
import type { CombatEvent } from '../sim/combat/events';

/** What a client sends about its character when joining. The host validates class and appearance. */
export interface NetCharacter {
  name: string;
  classId: string;
  appearance: Appearance;
  lastLocation: { mapId: string; x: number; y: number } | null;
  /** Level, xp and choices; untrusted, the host sanitizes it (sanitizeProgress). */
  progress?: unknown;
  /** Gold, bag and equipment; untrusted, the host sanitizes it (sanitizeBelongings). */
  belongings?: unknown;
}

export interface RosterEntry {
  id: EntityId;
  name: string;
  classId: ClassId;
  appearance: Appearance;
  /** Gear look per visible slot. */
  gear?: Record<string, string>;
}

export type ClientMessage =
  | { t: 'hello'; version: string; character: NetCharacter }
  | { t: 'input'; input: PlayerInput }
  | { t: 'chat'; text: string }
  | { t: 'progress-req'; req: ProgressRequest };

export type RejectReason = 'version' | 'full';

export type HostMessage =
  | { t: 'welcome'; playerId: EntityId; mapId: string; merchant?: { x: number; y: number } }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'snapshot'; s: WorldSnapshot; me?: MeSnapshot }
  | { t: 'events'; list: CombatEvent[] }
  | { t: 'roster'; players: RosterEntry[] }
  | { t: 'chat'; from: string; text: string }
  | { t: 'left'; playerId: EntityId; name: string }
  /** The receiving player's own progress (on join and whenever it changes). */
  | { t: 'progress'; p: ProgressInfo }
  /** Answer to a refused progress-req, for a message in the UI. */
  | { t: 'progress-refused'; reason: Exclude<RequestResult, 'ok'> }
  /** The receiving player's gold, bag and equipment (on join and whenever they change). */
  | { t: 'inventory'; inv: InventoryInfo };

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
const PRESS_SLOTS = new Set(['lmb', 'rmb', 's1', 's2', 's3', 's4', 'dodge']);
const MAX_PRESSES = 16;
const isPress = (v: unknown): v is Press => isObj(v) && isNum(v.seq) && isStr(v.slot) && PRESS_SLOTS.has(v.slot) && isNum(v.aimX) && isNum(v.aimY);

const isInput = (v: unknown): v is PlayerInput =>
  isObj(v) &&
  isNum(v.seq) &&
  isNum(v.moveX) &&
  isNum(v.moveY) &&
  isNum(v.aimX) &&
  isNum(v.aimY) &&
  (v.buttons === undefined || isNum(v.buttons)) &&
  (v.presses === undefined || (Array.isArray(v.presses) && v.presses.length <= MAX_PRESSES && v.presses.every(isPress)));

/** Shape only: whether the ids exist in the catalog is decided by the host. */
const isAppearanceShape = (v: unknown): v is Appearance =>
  isObj(v) && isStr(v.body) && isStr(v.skin) && isStr(v.hairStyle) && isStr(v.hairColor);

const isLocation = (v: unknown) => v === null || (isObj(v) && isStr(v.mapId) && isNum(v.x) && isNum(v.y));

const isNetCharacter = (v: unknown): v is NetCharacter =>
  isObj(v) && isStr(v.name) && isStr(v.classId) && isAppearanceShape(v.appearance) && isLocation(v.lastLocation);

const STATES = new Set(['alive', 'downed', 'dead']);
const isUnit = (u: unknown): u is UnitSnapshot =>
  isObj(u) &&
  isNum(u.id) &&
  (u.kind === 'player' || u.kind === 'monster') &&
  isStr(u.type) &&
  isStr(u.name) &&
  isNum(u.x) &&
  isNum(u.y) &&
  Number.isInteger(u.facing) &&
  (u.facing as number) >= 0 &&
  (u.facing as number) <= 3 &&
  isBool(u.moving) &&
  isNum(u.hp) &&
  isNum(u.maxHp) &&
  STATES.has(u.state as string) &&
  isNum(u.lastInputSeq) &&
  (u.action === undefined || (isObj(u.action) && isStr(u.action.anim) && isNum(u.action.ms)));

const isSnapshot = (v: unknown): v is WorldSnapshot => isObj(v) && isNum(v.tick) && Array.isArray(v.units) && v.units.every(isUnit);

/** Light check: the private block only feeds the HUD and prediction of the local player. */
const isMe = (v: unknown): v is MeSnapshot =>
  isObj(v) && isNum(v.resource) && isNum(v.maxResource) && isObj(v.cd) && isNum(v.gcd) && isNum(v.moveSpeed) && isBool(v.canMove) && isNum(v.lastPressSeq);

const ATTRS = new Set(['strength', 'agility', 'intellect', 'stamina', 'spirit']);

/** Shape only; the host decides whether the request is allowed. */
function toRequest(v: unknown): ProgressRequest | null {
  if (!isObj(v) || !isStr(v.k)) return null;
  switch (v.k) {
    case 'attr':
      return isStr(v.attr) && ATTRS.has(v.attr) ? { k: 'attr', attr: v.attr as Extract<ProgressRequest, { k: 'attr' }>['attr'] } : null;
    case 'talent':
      return isStr(v.node) ? { k: 'talent', node: v.node } : null;
    case 'spec':
      return isStr(v.specId) ? { k: 'spec', specId: v.specId } : null;
    case 'resetTalents':
    case 'resetAttrs':
      return { k: v.k };
    case 'hotbar':
      return isNum(v.slot) && (v.abilityId === null || isStr(v.abilityId)) ? { k: 'hotbar', slot: v.slot, abilityId: v.abilityId } : null;
    case 'equip':
      return isNum(v.index) && (v.place === undefined || isPlace(v.place)) ? { k: 'equip', index: v.index, ...(v.place ? { place: v.place } : {}) } : null;
    case 'unequip':
      return isPlace(v.place) ? { k: 'unequip', place: v.place } : null;
    case 'use':
      return isStr(v.potion) && (POTIONS as readonly string[]).includes(v.potion) ? { k: 'use', potion: v.potion as (typeof POTIONS)[number] } : null;
    case 'buy':
      return isStr(v.id) ? { k: 'buy', id: v.id } : null;
    case 'sell':
      return isNum(v.index) ? { k: 'sell', index: v.index } : null;
    case 'repair':
      return { k: 'repair' };
    case 'merchant':
      return isBool(v.open) ? { k: 'merchant', open: v.open } : null;
    default:
      return null;
  }
}

const isProgress = (v: unknown): v is ProgressInfo =>
  isObj(v) &&
  isNum(v.level) &&
  isNum(v.xp) &&
  isNum(v.xpToNext) &&
  isObj(v.attributes) &&
  isNum(v.freeAttrPoints) &&
  isObj(v.talents) &&
  isNum(v.freeTalentPoints) &&
  (v.specId === null || isStr(v.specId)) &&
  Array.isArray(v.hotbar) &&
  isObj(v.slots) &&
  Array.isArray(v.unlocked) &&
  Array.isArray(v.passives) &&
  isObj(v.stats);

const REFUSALS = new Set(['invalid', 'points', 'combat', 'level', 'full', 'gold', 'class', 'far', 'cooldown', 'none']);
const isPlace = (v: unknown): v is (typeof EQUIP_SLOTS)[number] => isStr(v) && (EQUIP_SLOTS as readonly string[]).includes(v);
const isInventory = (v: unknown): v is InventoryInfo =>
  isObj(v) && isNum(v.gold) && Array.isArray(v.inventory) && isObj(v.equipment) && isNum(v.potionCdMs) && (v.merchant === null || isObj(v.merchant));

const isEvents = (v: unknown): v is CombatEvent[] => Array.isArray(v) && v.every((e) => isObj(e) && isStr(e.e));

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
    case 'progress-req': {
      const req = toRequest(m.req);
      return req ? { t: 'progress-req', req } : null;
    }
    default:
      return null;
  }
}

export function decodeHost(raw: string): HostMessage | null {
  const m = parse(raw);
  if (!m) return null;
  switch (m.t) {
    case 'welcome':
      if (!isNum(m.playerId) || !isStr(m.mapId)) return null;
      return isObj(m.merchant) && isNum(m.merchant.x) && isNum(m.merchant.y)
        ? { t: 'welcome', playerId: m.playerId, mapId: m.mapId, merchant: { x: m.merchant.x, y: m.merchant.y } }
        : { t: 'welcome', playerId: m.playerId, mapId: m.mapId };
    case 'reject':
      return m.reason === 'version' || m.reason === 'full' ? { t: 'reject', reason: m.reason } : null;
    case 'snapshot':
      if (!isSnapshot(m.s)) return null;
      if (m.me === undefined) return { t: 'snapshot', s: m.s };
      return isMe(m.me) ? { t: 'snapshot', s: m.s, me: m.me } : null;
    case 'events':
      return isEvents(m.list) ? { t: 'events', list: m.list } : null;
    case 'roster':
      return isRoster(m.players) ? { t: 'roster', players: m.players } : null;
    case 'chat':
      return isStr(m.from) && isStr(m.text) ? { t: 'chat', from: m.from, text: m.text } : null;
    case 'left':
      return isNum(m.playerId) && isStr(m.name) ? { t: 'left', playerId: m.playerId, name: m.name } : null;
    case 'progress':
      return isProgress(m.p) ? { t: 'progress', p: m.p } : null;
    case 'inventory':
      return isInventory(m.inv) ? { t: 'inventory', inv: m.inv } : null;
    case 'progress-refused':
      return isStr(m.reason) && REFUSALS.has(m.reason) ? { t: 'progress-refused', reason: m.reason as Exclude<RequestResult, 'ok'> } : null;
    default:
      return null;
  }
}
