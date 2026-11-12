import type { Appearance, ClassId } from '../../appearance/catalog';
import type { ActionAnim } from '../../appearance/catalog-types';
import { PLAYER_RADIUS } from '../constants';
import { DOWN, type Facing } from '../facing';
import type { EntityId, Vec2 } from '../types';
import { BALANCE, CLASSES, MONSTERS, type PassiveDef, type ResourceKind, type School, type StatKey, type StatMod } from './defs';
import { computeStats, monsterBaseStats, playerBaseStats, type Stats } from './stats';

export type Team = 'players' | 'monsters';
export type LifeState = 'alive' | 'downed' | 'dead';

/** Bits of PlayerInput.buttons (held keys). */
export const BUTTON = { lmb: 1, rmb: 2, interact: 128 } as const;

export type StatusKind = 'buff' | 'debuff' | 'dot' | 'hot' | 'stun' | 'root' | 'freeze' | 'slow' | 'shield' | 'taunt';

export interface Status {
  kind: StatusKind;
  until: number;
  sourceId: EntityId;
  stat?: StatKey;
  pct?: number;
  /** Shield: remaining absorb. dot/hot: amount per tick. */
  amount?: number;
  tickMs?: number;
  nextTick?: number;
  school?: School;
}

export interface DashState {
  dx: number;
  dy: number;
  ticksLeft: number;
  /** Ability whose effects apply on contact (charge) or at the end (then). */
  abilityId?: string;
  stopOnHit?: boolean;
  aim?: Vec2;
}

export interface MonsterAi {
  state: 'idle' | 'combat' | 'return';
  threat: Map<EntityId, number>;
  spawn: Vec2;
  path: Vec2[];
  nextRepathAt: number;
  nextWanderAt: number;
  wanderTo: Vec2 | null;
  spawnerId?: number;
}

export interface Unit {
  id: EntityId;
  kind: 'player' | 'monster';
  team: Team;
  name: string;
  classId?: ClassId;
  appearance?: Appearance;
  monsterType?: string;
  pos: Vec2;
  radius: number;
  facing: Facing;
  moving: boolean;
  idleTicks: number;
  lastInputSeq: number;
  lastPressSeq: number;
  /** Held buttons from the latest input. */
  held: number;
  state: LifeState;
  downedUntil: number;
  respawnAt: number;
  diedAt: number;
  hp: number;
  resource: number;
  resourceKind: ResourceKind;
  baseStats: Stats;
  /** Permanent modifiers (passives; later equipment and talents). */
  mods: StatMod[];
  stats: Stats;
  statuses: Status[];
  passives: PassiveDef[];
  cooldowns: Record<string, number>;
  gcdUntil: number;
  inCombatUntil: number;
  lastHurtAt: number;
  lastRageGainAt: number;
  dash: DashState | null;
  invulnUntil: number;
  /** One-shot animation being played (for clients). */
  action: { anim: ActionAnim; at: number } | null;
  reviving: { targetId: EntityId; since: number } | null;
  ai?: MonsterAi;
}

function blankUnit(id: EntityId, pos: Vec2): Omit<Unit, 'kind' | 'team' | 'name' | 'radius' | 'baseStats' | 'stats' | 'resourceKind'> {
  return {
    id,
    pos: { ...pos },
    facing: DOWN,
    moving: false,
    idleTicks: 5,
    lastInputSeq: 0,
    lastPressSeq: 0,
    held: 0,
    state: 'alive',
    downedUntil: 0,
    respawnAt: 0,
    diedAt: 0,
    hp: 0,
    resource: 0,
    mods: [],
    statuses: [],
    passives: [],
    cooldowns: {},
    gcdUntil: 0,
    inCombatUntil: 0,
    lastHurtAt: -1e9,
    lastRageGainAt: 0,
    dash: null,
    invulnUntil: 0,
    action: null,
    reviving: null,
  };
}

export function createPlayerUnit(id: EntityId, info: { name: string; classId: ClassId; appearance: Appearance }, pos: Vec2): Unit {
  const c = CLASSES[info.classId]!;
  const baseStats = playerBaseStats(c);
  const u: Unit = {
    ...blankUnit(id, pos),
    kind: 'player',
    team: 'players',
    name: info.name,
    classId: info.classId,
    appearance: info.appearance,
    radius: PLAYER_RADIUS,
    resourceKind: c.resource,
    baseStats,
    stats: baseStats,
    passives: c.passives,
    mods: c.passives.flatMap((p) => p.mods ?? []),
  };
  recomputeStats(u, 0);
  u.hp = u.stats.maxHp;
  u.resource = u.resourceKind === 'rage' ? 0 : u.stats.maxResource;
  return u;
}

export function createMonsterUnit(id: EntityId, type: string, pos: Vec2, hpScale: number): Unit {
  const def = MONSTERS[type];
  if (!def) throw new Error(`unknown monster ${type}`);
  const baseStats = monsterBaseStats({ ...def.stats, maxHp: def.stats.maxHp * hpScale });
  const u: Unit = {
    ...blankUnit(id, pos),
    kind: 'monster',
    team: 'monsters',
    name: type,
    monsterType: type,
    radius: def.radius,
    resourceKind: 'none',
    baseStats,
    stats: baseStats,
    ai: { state: 'idle', threat: new Map(), spawn: { ...pos }, path: [], nextRepathAt: 0, nextWanderAt: 0, wanderTo: null },
  };
  u.hp = u.stats.maxHp;
  return u;
}

/** Recomputes stats from base + permanent mods + active buff/debuff/slow statuses; clamps hp/resource. */
export function recomputeStats(u: Unit, now: number): void {
  const statusMods: StatMod[] = [];
  for (const s of u.statuses) {
    if (s.until <= now) continue;
    if ((s.kind === 'buff' || s.kind === 'debuff') && s.stat && s.pct) statusMods.push({ stat: s.stat, pct: s.kind === 'buff' ? s.pct : -s.pct });
    if (s.kind === 'slow' && s.pct) statusMods.push({ stat: 'moveSpeed', pct: -s.pct });
  }
  u.stats = computeStats(u.baseStats, [...u.mods, ...statusMods]);
  u.hp = Math.min(u.hp, u.stats.maxHp);
  u.resource = Math.min(u.resource, u.stats.maxResource);
}

export const hasStatus = (u: Unit, kind: StatusKind, now: number) => u.statuses.some((s) => s.kind === kind && s.until > now);

/** Stunned or frozen units cannot act. */
export const cannotAct = (u: Unit, now: number) => u.state !== 'alive' || hasStatus(u, 'stun', now) || hasStatus(u, 'freeze', now);

/** Rooted, stunned or frozen units cannot move. */
export const cannotMove = (u: Unit, now: number) => cannotAct(u, now) || hasStatus(u, 'root', now);

export const isEnemy = (a: Unit, b: Unit) => a.team !== b.team;

export function passiveValue<K extends keyof PassiveDef>(u: Unit, key: K): PassiveDef[K] | undefined {
  for (const p of u.passives) if (p[key] !== undefined) return p[key];
  return undefined;
}

export const DASH_TICKS = Math.round(BALANCE.dodge.durationMs / 50);
