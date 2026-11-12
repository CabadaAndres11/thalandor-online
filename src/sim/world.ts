import type { Appearance, ClassId } from '../appearance/catalog';
import type { ActionAnim } from '../appearance/catalog-types';
import type { CollisionMap } from './collision-map';
import { PLAYER_RADIUS, TICK_MS, TILE_SIZE } from './constants';
import { facingFromVector } from './facing';
import { dodgeDirection, stepPlayerMovement } from './movement';
import type { EntityId, PlayerInput, Press, Vec2 } from './types';
import { stepAreas, stepDash, stepProjectiles, useAbility, type PendingArea, type Projectile } from './combat/actions';
import { BALANCE, CLASSES, MONSTERS, SLOTS, type School } from './combat/defs';
import type { CombatEvent } from './combat/events';
import { applyDamage, applyHeal, monsterHpScale, rescaleMonster, stepLife, stepStatusesAndResources } from './combat/life';
import type { Rng } from './combat/damage';
import { BUTTON, cannotMove, createMonsterUnit, createPlayerUnit, DASH_TICKS, hasStatus, type PlayerProgress, type Unit } from './combat/unit';
import { shareXp } from './progression/xp';
import { stepMonster } from './monsters/ai';

/** Ticks without a moving input before a player counts as standing (hides single lost packets). */
const IDLE_TICKS_TO_STOP = 5;
/** Dead monsters stay this long (death animation) before being removed. */
const CORPSE_MS = 1500;
/** One-shot actions are reported to clients for this long. */
const ACTION_REPORT_MS = 1200;

export interface PlayerInfo {
  name: string;
  classId: ClassId;
  appearance: Appearance;
  progress?: PlayerProgress;
}

/** Kept for code that only deals with players. */
export type PlayerState = Unit;

export interface SpawnDef {
  id: number;
  monster: string;
  x: number;
  y: number;
  count: number;
  respawnMs: number;
}

export interface WorldOptions {
  rng?: Rng;
  spawns?: SpawnDef[];
}

export interface UnitSnapshot {
  id: EntityId;
  kind: 'player' | 'monster';
  /** classId for players, monster type for monsters. */
  type: string;
  name: string;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  hp: number;
  maxHp: number;
  state: 'alive' | 'downed' | 'dead';
  lastInputSeq: number;
  /** One-shot animation and how long ago it started. */
  action?: { anim: ActionAnim; ms: number };
}

export interface WorldSnapshot {
  tick: number;
  units: UnitSnapshot[];
}

/** Private per-player block: resources, cooldowns and status for the HUD and prediction. */
export interface MeSnapshot {
  resource: number;
  maxResource: number;
  resourceKind: string;
  /** Remaining cooldown per slot (ms). */
  cd: Record<string, number>;
  gcd: number;
  shield: number;
  downedMs: number;
  respawnMs: number;
  moveSpeed: number;
  canMove: boolean;
  lastPressSeq: number;
  statuses: { kind: string; ms: number }[];
  reviving: { targetId: EntityId; pct: number } | null;
  /** Remaining dodge/charge dash, so client prediction can resume it after reconciling. */
  dash: { dx: number; dy: number; ticks: number } | null;
}

function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SpawnSlot {
  def: SpawnDef;
  index: number;
  unitId: EntityId | null;
  respawnAt: number;
}

/** Authoritative world state for one zone. Pure simulation: no I/O, no timers. */
export class World {
  tick = 0;
  readonly rng: Rng;
  projectiles: Projectile[] = [];
  areas: PendingArea[] = [];
  private events: CombatEvent[] = [];
  private nextId = 1;
  private nextProj = 1;
  private readonly units = new Map<EntityId, Unit>();
  private readonly pending = new Map<EntityId, PlayerInput[]>();
  private readonly lastAim = new Map<EntityId, Vec2>();
  private readonly slots: SpawnSlot[];
  private hpScale = 1;

  constructor(
    readonly map: CollisionMap,
    readonly spawn: Vec2,
    opts: WorldOptions = {},
  ) {
    this.rng = opts.rng ?? mulberry32(0x7a1a);
    this.slots = (opts.spawns ?? []).flatMap((def) => Array.from({ length: def.count }, (_, index) => ({ def, index, unitId: null, respawnAt: 0 })));
  }

  /** Simulation time of the current tick (ms). */
  get now(): number {
    return this.tick * TICK_MS;
  }

  emit(e: CombatEvent): void {
    this.events.push(e);
  }

  drainEvents(): CombatEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  nextProjectileId(): number {
    return this.nextProj++;
  }

  addPlayer(info: PlayerInfo, at?: Vec2): Unit {
    const u = createPlayerUnit(this.nextId++, info, at ?? this.spawn);
    this.units.set(u.id, u);
    this.pending.set(u.id, []);
    return u;
  }

  addMonster(type: string, at: Vec2): Unit {
    const u = createMonsterUnit(this.nextId++, type, at, this.hpScale);
    this.units.set(u.id, u);
    return u;
  }

  removePlayer(id: EntityId): void {
    this.units.delete(id);
    this.pending.delete(id);
    this.dropFromThreat(id);
  }

  getUnit(id: EntityId): Unit | undefined {
    return this.units.get(id);
  }

  getPlayer(id: EntityId): Unit | undefined {
    const u = this.units.get(id);
    return u?.kind === 'player' ? u : undefined;
  }

  allUnits(): Unit[] {
    return [...this.units.values()];
  }

  allPlayers(): Unit[] {
    return this.allUnits().filter((u) => u.kind === 'player');
  }

  queueInput(id: EntityId, input: PlayerInput): void {
    this.pending.get(id)?.push(input);
  }

  /** True when a circle of `radius` centred at p touches no solid tile. */
  isSpawnable(p: Vec2, radius: number = PLAYER_RADIUS): boolean {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    const x0 = Math.floor((p.x - radius) / TILE_SIZE);
    const x1 = Math.floor((p.x + radius - 1e-6) / TILE_SIZE);
    const y0 = Math.floor((p.y - radius) / TILE_SIZE);
    const y1 = Math.floor((p.y + radius - 1e-6) / TILE_SIZE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.map.isSolidTile(tx, ty)) return false;
    return true;
  }

  // --- combat helpers used by the combat modules ---

  damage(target: Unit, amount: number, src: Unit | null, school: School, crit = false): void {
    applyDamage(this, target, amount, src, school, crit);
  }

  heal(target: Unit, amount: number, src: Unit | null, school: School, crit = false): void {
    applyHeal(this, target, amount, src, school, crit);
  }

  /** Adds threat on a monster towards a player; wakes it up and alerts its pack. */
  addThreat(monster: Unit, src: Unit, amount: number): void {
    const ai = monster.ai;
    if (!ai || monster.state !== 'alive' || src.kind !== 'player' || src.state !== 'alive') return;
    ai.threat.set(src.id, (ai.threat.get(src.id) ?? 0) + amount);
    if (ai.state !== 'combat') ai.state = 'combat';
    const def = MONSTERS[monster.monsterType ?? ''];
    if (def?.behavior === 'pack') {
      for (const m of this.allUnits()) {
        if (m === monster || m.monsterType !== monster.monsterType || m.state !== 'alive' || !m.ai) continue;
        if (Math.hypot(m.pos.x - monster.pos.x, m.pos.y - monster.pos.y) > BALANCE.monsters.packAlertRange) continue;
        if (!m.ai.threat.has(src.id)) m.ai.threat.set(src.id, 1);
        m.ai.state = 'combat';
      }
    }
  }

  dropFromThreat(id: EntityId): void {
    for (const u of this.units.values()) u.ai?.threat.delete(id);
  }

  /** The player a monster attacks: a taunter first, then the highest threat among living players. */
  topTarget(m: Unit): Unit | null {
    const taunt = m.statuses.find((s) => s.kind === 'taunt' && s.until > this.now);
    if (taunt) {
      const t = this.units.get(taunt.sourceId);
      if (t?.state === 'alive') return t;
    }
    let best: Unit | null = null;
    let bestThreat = -Infinity;
    for (const [id, threat] of m.ai?.threat ?? []) {
      const p = this.units.get(id);
      if (!p || p.state !== 'alive') continue;
      if (threat > bestThreat) {
        best = p;
        bestThreat = threat;
      }
    }
    return best;
  }

  onMonsterDied(m: Unit): void {
    m.ai?.threat.clear();
    shareXp(this, m);
    const slot = this.slots.find((s) => s.unitId === m.id);
    if (slot) slot.respawnAt = this.now + slot.def.respawnMs;
  }

  // --- simulation ---

  step(): void {
    const now = this.now;
    for (const u of this.units.values()) if (u.kind === 'player') this.stepPlayer(u);
    for (const u of this.units.values()) if (u.kind === 'monster') stepMonster(this, u);
    for (const u of this.units.values()) if (u.kind === 'player') this.autoAttack(u);
    stepProjectiles(this);
    stepAreas(this);
    stepStatusesAndResources(this);
    stepLife(this);
    this.stepSpawns();
    this.updateScaling();
    for (const u of this.units.values()) if (u.action && now - u.action.at > ACTION_REPORT_MS) u.action = null;
    this.tick++;
  }

  private stepPlayer(p: Unit): void {
    const queue = this.pending.get(p.id) ?? [];
    queue.sort((a, b) => a.seq - b.seq);
    let movedThisTick = false;
    let explicitStop = false;
    let processed = false;
    for (const input of queue) {
      if (input.seq <= p.lastInputSeq) continue;
      processed = true;
      p.lastInputSeq = input.seq;
      p.held = input.buttons ?? 0;
      const aim = { x: input.aimX, y: input.aimY };
      this.lastAim.set(p.id, aim);
      const presses = [...(input.presses ?? [])].sort((a, b) => a.seq - b.seq);
      for (const press of presses) {
        if (press.seq <= p.lastPressSeq) continue;
        p.lastPressSeq = press.seq;
        if (p.state === 'alive') this.handlePress(p, press, input);
      }
      if (p.state !== 'alive') continue;
      const moves = input.moveX !== 0 || input.moveY !== 0;
      if (p.dash) {
        stepDash(this, p);
        movedThisTick = true;
      } else if (!cannotMove(p, this.now)) {
        p.pos = stepPlayerMovement(p.pos, input, this.map, p.stats.moveSpeed);
        if (moves) movedThisTick = true;
      }
      if (!moves && !p.dash) explicitStop = true;
      if (moves) p.facing = facingFromVector(input.moveX, input.moveY, p.facing);
      else if (!p.action) p.facing = facingFromVector(input.aimX - p.pos.x, input.aimY - p.pos.y, p.facing);
    }
    queue.length = 0;
    if (!processed && p.dash && p.state === 'alive') {
      stepDash(this, p);
      movedThisTick = true;
    }
    if (movedThisTick && p.state === 'alive' && !cannotMove(p, this.now)) p.idleTicks = 0;
    else if (explicitStop) p.idleTicks = IDLE_TICKS_TO_STOP;
    else if (p.idleTicks < IDLE_TICKS_TO_STOP) p.idleTicks++;
    if (cannotMove(p, this.now)) p.idleTicks = IDLE_TICKS_TO_STOP;
    p.moving = p.idleTicks < IDLE_TICKS_TO_STOP;
  }

  private handlePress(p: Unit, press: Press, input: PlayerInput): void {
    const aim = { x: press.aimX, y: press.aimY };
    if (press.slot === 'dodge') {
      if ((p.cooldowns.dodge ?? 0) > this.now || cannotMove(p, this.now) || p.dash) return;
      const dir = dodgeDirection(p.pos, input);
      const per = BALANCE.dodge.distance / DASH_TICKS;
      p.dash = { dx: dir.x * per, dy: dir.y * per, ticksLeft: DASH_TICKS };
      p.invulnUntil = this.now + BALANCE.dodge.invulnMs;
      p.cooldowns.dodge = this.now + BALANCE.dodge.cooldownMs;
      return;
    }
    if (!SLOTS.includes(press.slot)) return;
    const abilityId = p.slots[press.slot];
    if (abilityId) useAbility(this, p, abilityId, aim);
  }

  /** Held basic-attack buttons fire again whenever ready. */
  private autoAttack(p: Unit): void {
    if (p.state !== 'alive' || !p.held || p.dash) return;
    const slots = p.slots;
    const aim = this.lastAim.get(p.id);
    if (!slots || !aim) return;
    if (p.held & BUTTON.lmb && slots.lmb) useAbility(this, p, slots.lmb, aim);
    else if (p.held & BUTTON.rmb && slots.rmb) useAbility(this, p, slots.rmb, aim);
  }

  private stepSpawns(): void {
    const now = this.now;
    for (const u of [...this.units.values()]) {
      if (u.kind === 'monster' && u.state === 'dead' && now - u.diedAt >= CORPSE_MS) {
        this.units.delete(u.id);
        const slot = this.slots.find((s) => s.unitId === u.id);
        if (slot) slot.unitId = null;
      }
    }
    for (const slot of this.slots) {
      if (slot.unitId !== null || slot.respawnAt > now) continue;
      const { def } = slot;
      const angle = (slot.index / Math.max(1, def.count)) * Math.PI * 2;
      const r = def.count > 1 ? 28 : 0;
      let at = { x: def.x + Math.cos(angle) * r, y: def.y + Math.sin(angle) * r };
      if (!this.isSpawnable(at, MONSTERS[def.monster]?.radius ?? 10)) at = { x: def.x, y: def.y };
      const m = this.addMonster(def.monster, at);
      m.ai!.spawnerId = def.id;
      slot.unitId = m.id;
    }
  }

  private updateScaling(): void {
    const scale = monsterHpScale(this.allPlayers().length);
    if (scale === this.hpScale) return;
    this.hpScale = scale;
    for (const m of this.units.values()) if (m.kind === 'monster') rescaleMonster(m, scale, this.now);
  }

  // --- snapshots ---

  private unitSnapshot(u: Unit): UnitSnapshot {
    const s: UnitSnapshot = {
      id: u.id,
      kind: u.kind,
      type: u.kind === 'player' ? (u.classId ?? '') : (u.monsterType ?? ''),
      name: u.name,
      x: u.pos.x,
      y: u.pos.y,
      facing: u.facing,
      moving: u.moving,
      hp: Math.ceil(u.hp),
      maxHp: Math.round(u.stats.maxHp),
      state: u.state,
      lastInputSeq: u.lastInputSeq,
    };
    if (u.action) s.action = { anim: u.action.anim, ms: this.now - u.action.at };
    return s;
  }

  snapshot(): WorldSnapshot {
    return { tick: this.tick, units: this.allUnits().map((u) => this.unitSnapshot(u)) };
  }

  /** Snapshot for one player: units within the interest range, plus that player's private block. */
  snapshotFor(playerId: EntityId): { snap: WorldSnapshot; me: MeSnapshot | null } {
    const me = this.units.get(playerId);
    const range = BALANCE.net.interestRange;
    const units = this.allUnits()
      .filter((u) => !me || u.id === me.id || Math.hypot(u.pos.x - me.pos.x, u.pos.y - me.pos.y) <= range)
      .map((u) => this.unitSnapshot(u));
    return { snap: { tick: this.tick, units }, me: me ? this.meSnapshot(me) : null };
  }

  meSnapshot(u: Unit): MeSnapshot {
    const now = this.now;
    const slots = u.slots;
    const cd: Record<string, number> = {};
    if (slots) for (const [slot, id] of Object.entries(slots)) if (id) cd[slot] = Math.max(0, (u.cooldowns[id] ?? 0) - now);
    cd.dodge = Math.max(0, (u.cooldowns.dodge ?? 0) - now);
    const reviving = u.reviving ? { targetId: u.reviving.targetId, pct: Math.min(1, (now - u.reviving.since) / BALANCE.death.reviveMs) } : null;
    return {
      resource: Math.floor(u.resource),
      maxResource: Math.round(u.stats.maxResource),
      resourceKind: u.resourceKind,
      cd,
      gcd: Math.max(0, u.gcdUntil - now),
      shield: u.statuses.filter((s) => s.kind === 'shield' && s.until > now).reduce((a, s) => a + (s.amount ?? 0), 0),
      downedMs: u.state === 'downed' ? Math.max(0, u.downedUntil - now) : 0,
      respawnMs: u.state === 'dead' ? Math.max(0, u.respawnAt - now) : 0,
      moveSpeed: u.stats.moveSpeed,
      canMove: !cannotMove(u, now) && !hasStatus(u, 'root', now),
      lastPressSeq: u.lastPressSeq,
      statuses: u.statuses.filter((s) => s.until > now).map((s) => ({ kind: s.kind, ms: s.until - now })),
      reviving,
      dash: u.dash ? { dx: u.dash.dx, dy: u.dash.dy, ticks: u.dash.ticksLeft } : null,
    };
  }
}
