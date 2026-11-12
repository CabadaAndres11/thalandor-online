import { moveCircle } from '../movement';
import { facingFromVector } from '../facing';
import type { EntityId, Vec2 } from '../types';
import type { World } from '../world';
import { ability, BALANCE, type AbilityDef, type DamageBonus, type EffectDef } from './defs';
import { rollDamage, rollHeal } from './damage';
import { cannotAct, isEnemy, isStealthed, passivesWith, passiveValue, recomputeStats, type HitCtx, type Unit } from './unit';

export type UseResult = 'ok' | 'unknown' | 'control' | 'cooldown' | 'gcd' | 'resource' | 'range' | 'combo';

export interface Projectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  distLeft: number;
  casterId: EntityId;
  abilityId: string;
  ctx: HitCtx;
  /** Pierce: units already hit. */
  hit: EntityId[];
}

export interface PendingArea {
  at: number;
  center: Vec2;
  radius: number;
  casterId: EntityId;
  abilityId: string;
  ctx: HitCtx;
}

export interface Zone {
  center: Vec2;
  radius: number;
  until: number;
  nextTick: number;
  tickMs: number;
  casterId: EntityId;
  abilityId: string;
}

const TICK_SEC = 0.05;
export const MAX_COMBO = 5;
const len = (v: Vec2) => Math.hypot(v.x, v.y);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
/** Unit vector of each Facing (UP, LEFT, DOWN, RIGHT). */
const FACING_VECTORS: Vec2[] = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
];

/**
 * Distance from a point to a unit's body: a vertical segment from its feet up to its head.
 * Units stand at their feet but are drawn ~40 px tall, so aiming at the drawn body must hit.
 */
export function bodyDistance(t: Unit, p: Vec2): number {
  const top = t.pos.y - t.height;
  const y = Math.max(top, Math.min(t.pos.y, p.y));
  return Math.hypot(p.x - t.pos.x, p.y - y);
}

function dirTo(from: Vec2, to: Vec2, fallback: Vec2 = { x: 0, y: 1 }): Vec2 {
  const d = { x: to.x - from.x, y: to.y - from.y };
  const l = len(d);
  return l < 1e-6 ? fallback : { x: d.x / l, y: d.y / l };
}

/** Cooldown after reduction (cap 40 %) and chill (slows that lengthen cooldowns). */
export function effectiveCooldown(world: World, u: Unit, ab: AbilityDef): number {
  const cdr = Math.min(BALANCE.combat.cooldownReductionCap, Math.max(0, u.stats.cooldownReduction));
  let chill = 0;
  for (const s of u.statuses) if (s.kind === 'slow' && s.until > world.now && s.attackSlowPct) chill = Math.max(chill, s.attackSlowPct);
  return ab.cooldownMs * (1 - cdr) * (1 + chill);
}

/** Checks whether a unit can use an ability right now (without using it). */
export function checkUse(world: World, u: Unit, ab: AbilityDef): UseResult {
  if (cannotAct(u, world.now) || u.channel) return 'control';
  if ((u.cooldowns[ab.id] ?? 0) > world.now) return 'cooldown';
  if (ab.gcd && u.gcdUntil > world.now) return 'gcd';
  if (ab.cost > u.resource + 1e-9) return 'resource';
  if (ab.comboSpend && u.combo <= 0) return 'combo';
  return 'ok';
}

const breaksStealth = (ab: AbilityDef) => !ab.effects.some((e) => e.type === 'stealth');

/** Validates and executes an ability for a unit aiming at `aim` (world coordinates). */
export function useAbility(world: World, u: Unit, abilityId: string, aim: Vec2, free = false): UseResult {
  const ab = ability(abilityId);
  if (!ab) return 'unknown';
  const ctx: HitCtx = {};
  if (!free) {
    const r = checkUse(world, u, ab);
    if (r !== 'ok') return r;
    u.resource -= ab.cost;
    u.cooldowns[ab.id] = world.now + effectiveCooldown(world, u, ab);
    if (ab.gcd) u.gcdUntil = world.now + BALANCE.combat.gcdMs;
    if (u.kind === 'player' && abilityId === u.slots.lmb) {
      u.basicCount++;
      const nth = passiveValue(u, 'everyNthBasic');
      if (nth && u.basicCount % nth.n === 0) ctx.forceCrit = true;
    }
  }
  if (breaksStealth(ab) && isStealthed(u, world.now)) {
    breakStealth(world, u);
    const ambush = passiveValue(u, 'ambush');
    if (ambush) {
      ctx.forceCrit = true;
      ctx.bonusPct = (ctx.bonusPct ?? 0) + ambush.bonusPct;
    }
  }
  if (ab.comboSpend) {
    ctx.comboSpent = u.combo;
    u.combo = 0;
  }
  const dir = dirTo(u.pos, aim, { x: 0, y: 1 });
  u.facing = facingFromVector(dir.x, dir.y, u.facing);
  if (ab.anim !== 'none') {
    u.action = { anim: ab.anim, at: world.now };
    world.emit({ e: 'cast', src: u.id, anim: ab.anim, facing: u.facing });
  }
  if (ab.channelMs && !free) {
    const tick = ab.channelTickMs ?? 0;
    u.channel = { abilityId: ab.id, aim: { ...aim }, until: world.now + ab.channelMs, nextTick: tick > 0 ? world.now + tick : Infinity, ctx };
    u.moving = false;
    world.emit({ e: 'channel', src: u.id, ms: ab.channelMs });
    return 'ok';
  }
  resolveAbility(world, u, ab, aim, ctx);
  return 'ok';
}

/** The shape part of an ability: who it reaches and when. */
function resolveAbility(world: World, u: Unit, ab: AbilityDef, aim: Vec2, ctx: HitCtx): void {
  const dir = dirTo(u.pos, aim, { x: 0, y: 1 });
  const shape = ab.shape;
  let hitEnemy = false;
  switch (shape.type) {
    case 'melee_arc': {
      const half = (shape.arcDeg / 2) * (Math.PI / 180);
      for (const t of world.allUnits()) {
        if (t === u || t.state !== 'alive' || !isEnemy(u, t)) continue;
        const d = dist(u.pos, t.pos);
        if (d > shape.radius + t.radius) continue;
        const to = dirTo(u.pos, t.pos, dir);
        const ang = Math.acos(Math.max(-1, Math.min(1, to.x * dir.x + to.y * dir.y)));
        if (d > t.radius && ang > half) continue;
        if (applyEffects(world, u, t, ab, ctx)) hitEnemy = true;
      }
      break;
    }
    case 'area_self':
      hitEnemy = applyArea(world, u, ab, u.pos, shape.radius, ctx);
      world.emit({ e: 'area', x: u.pos.x, y: u.pos.y, r: shape.radius, school: ab.school });
      break;
    case 'area_target': {
      const center = clampToRange(u, shape.atSelf ? { ...u.pos } : { ...aim }, dir, ab.range);
      if (shape.delayMs > 0) {
        world.areas.push({ at: world.now + shape.delayMs, center, radius: shape.radius, casterId: u.id, abilityId: ab.id, ctx });
        world.emit({ e: 'tele', x: center.x, y: center.y, r: shape.radius, ms: shape.delayMs, hostile: u.team === 'monsters' });
      } else {
        hitEnemy = applyArea(world, u, ab, center, shape.radius, ctx);
        world.emit({ e: 'area', x: center.x, y: center.y, r: shape.radius, school: ab.school });
      }
      break;
    }
    case 'zone': {
      const center = clampToRange(u, shape.atSelf ? { ...u.pos } : { ...aim }, dir, ab.range);
      world.zones.push({ center, radius: shape.radius, until: world.now + shape.durationMs, nextTick: world.now, tickMs: shape.tickMs, casterId: u.id, abilityId: ab.id });
      world.emit({ e: 'zone', x: center.x, y: center.y, r: shape.radius, ms: shape.durationMs, school: ab.school });
      break;
    }
    case 'projectile': {
      const count = Math.max(1, shape.count ?? 1);
      const spread = ((shape.spreadDeg ?? 0) * Math.PI) / 180;
      const range = ab.range * (1 + (passiveValue(u, 'rangePct') ?? 0));
      const base = Math.atan2(dir.y, dir.x);
      for (let i = 0; i < count; i++) {
        const a = count === 1 ? base : base - spread / 2 + (spread * i) / (count - 1);
        const d = { x: Math.cos(a), y: Math.sin(a) };
        const p: Projectile = {
          id: world.nextProjectileId(),
          pos: { x: u.pos.x + d.x * (u.radius + 2), y: u.pos.y + d.y * (u.radius + 2) },
          vel: { x: d.x * shape.speed, y: d.y * shape.speed },
          radius: shape.radius,
          distLeft: range,
          casterId: u.id,
          abilityId: ab.id,
          ctx,
          hit: [],
        };
        world.projectiles.push(p);
        world.emit({ e: 'proj', id: p.id, x: p.pos.x, y: p.pos.y, vx: p.vel.x, vy: p.vel.y, look: shape.look, ttlMs: (range / shape.speed) * 1000 });
      }
      break;
    }
    case 'ally_target': {
      const target = pickAlly(world, u, aim, ab.range, 'alive') ?? u;
      applyEffects(world, u, target, ab, ctx);
      break;
    }
    case 'revive': {
      const target = pickAlly(world, u, aim, ab.range, 'downed');
      if (target) applyEffects(world, u, target, ab, ctx);
      break;
    }
    case 'self':
      applyEffects(world, u, u, ab, ctx);
      break;
    case 'dash': {
      const d = shape.backwards ? { x: -dir.x, y: -dir.y } : dir;
      const ticks = Math.max(1, Math.ceil(shape.distance / 36));
      u.dash = { dx: (d.x * shape.distance) / ticks, dy: (d.y * shape.distance) / ticks, ticksLeft: ticks, abilityId: ab.id, stopOnHit: shape.stopOnHit, aim: { ...aim } };
      break;
    }
    case 'blink': {
      const step = 4;
      let last = { ...u.pos };
      for (let s = step; s <= shape.distance; s += step) {
        const p = { x: u.pos.x + dir.x * s, y: u.pos.y + dir.y * s };
        if (!world.isSpawnable(p, u.radius)) break;
        last = p;
      }
      u.pos = last;
      break;
    }
  }
  if (hitEnemy) onAbilityHit(world, u, ab);
}

function clampToRange(u: Unit, center: Vec2, dir: Vec2, range: number): Vec2 {
  if (dist(u.pos, center) <= range) return center;
  return { x: u.pos.x + dir.x * range, y: u.pos.y + dir.y * range };
}

/** Rage from hitting and combo points. */
function onAbilityHit(world: World, u: Unit, ab: AbilityDef): void {
  if (ab.gainOnHit) gainResource(world, u, ab.gainOnHit);
  if (ab.comboGain) {
    u.combo = Math.min(MAX_COMBO, u.combo + ab.comboGain + u.comboBonusNext);
    u.comboBonusNext = 0;
  }
}

function pickAlly(world: World, u: Unit, aim: Vec2, range: number, state: 'alive' | 'downed'): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const t of world.allUnits()) {
    // The caster is the fallback target, never a candidate: an ally standing on top of it must win.
    if (t === u || t.team !== u.team || t.state !== state) continue;
    const d = dist(t.pos, aim);
    if (d <= BALANCE.combat.allyPickRadius + t.radius && d < bestD && dist(u.pos, t.pos) <= range) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function applyArea(world: World, u: Unit, ab: AbilityDef, center: Vec2, radius: number, ctx: HitCtx): boolean {
  let hit = false;
  for (const t of world.allUnits()) {
    if (t.state !== 'alive' || dist(center, t.pos) > radius + t.radius) continue;
    if (applyEffects(world, u, t, ab, ctx)) hit = true;
  }
  return hit;
}

const defaultTo = (e: EffectDef) =>
  e.to ?? (e.type === 'heal' || e.type === 'hot' || e.type === 'shield' || e.type === 'buff' || e.type === 'revive' ? 'allies' : 'enemies');

/** Applies every effect of an ability that targets this unit's relation (enemy/ally/self). Returns true if an enemy was hit. */
export function applyEffects(world: World, caster: Unit, target: Unit, ab: AbilityDef, ctx: HitCtx = {}): boolean {
  const enemy = isEnemy(caster, target);
  let hitEnemy = false;
  for (const e of ab.effects) {
    const to = defaultTo(e);
    if (to === 'enemies' && !enemy) continue;
    if (to === 'allies' && enemy) continue;
    if (to === 'self' && target !== caster) continue;
    if (enemy) hitEnemy = true;
    applyEffect(world, caster, target, ab, e, ctx);
  }
  return hitEnemy;
}

function powerFor(caster: Unit, ab: AbilityDef, now: number): number {
  let p = ab.school === 'physical' ? caster.stats.attackPower : caster.stats.spellPower;
  const conc = passiveValue(caster, 'concentration');
  if (conc && ab.school !== 'physical' && now - caster.lastHurtAt >= conc.afterMs) p *= 1 + conc.spellDamagePct;
  return p;
}

function bonusApplies(world: World, b: DamageBonus, caster: Unit, target: Unit, ab: AbilityDef): boolean {
  const now = world.now;
  if (b.school && ab.school !== b.school) return false;
  if (b.ranged && ab.shape.type !== 'projectile') return false;
  if (b.vsStatus && !target.statuses.some((s) => s.until > now && b.vsStatus!.includes(s.kind))) return false;
  if (b.vsDotSchool && !target.statuses.some((s) => s.until > now && s.kind === 'dot' && s.school === b.vsDotSchool)) return false;
  if (b.far && dist(caster.pos, target.pos) <= BALANCE.combat.farDistance) return false;
  if (b.belowHpPct !== undefined && target.hp >= target.stats.maxHp * b.belowHpPct) return false;
  if (b.fromBehind) {
    const f = FACING_VECTORS[target.facing]!;
    const toCaster = dirTo(target.pos, caster.pos, f);
    if (f.x * toCaster.x + f.y * toCaster.y > -0.3) return false;
  }
  return true;
}

/** 1 + every bonus that applies (effect, passives, cast context, combo points). */
function damageBonusMult(world: World, caster: Unit, target: Unit, ab: AbilityDef, e: Extract<EffectDef, { type: 'damage' }>, ctx: HitCtx): number {
  let pct = ctx.bonusPct ?? 0;
  const all = [...(e.bonuses ?? []), ...passivesWith(caster, 'damageBonuses').flatMap((p) => p.damageBonuses)];
  for (const b of all) if (bonusApplies(world, b, caster, target, ab)) pct += b.pct;
  if (e.perComboPct && ctx.comboSpent) pct += e.perComboPct * ctx.comboSpent;
  return 1 + pct;
}

const isMeleePhysical = (ab: AbilityDef) => ab.school === 'physical' && (ab.shape.type === 'melee_arc' || ab.shape.type === 'dash');

function applyEffect(world: World, caster: Unit, target: Unit, ab: AbilityDef, e: EffectDef, ctx: HitCtx): void {
  const now = world.now;
  const invuln = target.invulnUntil > now;
  switch (e.type) {
    case 'damage': {
      if (invuln) {
        world.emit({ e: 'hit', src: caster.id, dst: target.id, amount: 0, crit: false, dodged: true, heal: false, absorbed: 0, school: ab.school });
        return;
      }
      const r = rollDamage({
        base: e.base,
        coef: e.coef,
        power: powerFor(caster, ab, now),
        school: ab.school,
        armor: target.stats.armor,
        critChance: caster.stats.critChance,
        dodgeChance: target.stats.dodgeChance,
        dodgeable: ab.dodgeable,
        dmgMult: caster.stats.damageDone * target.stats.damageTaken * damageBonusMult(world, caster, target, ab, e, ctx),
        critBonus: caster.stats.critDamage,
        forceCrit: ctx.forceCrit,
        rng: world.rng,
      });
      if (r.dodged) {
        world.emit({ e: 'hit', src: caster.id, dst: target.id, amount: 0, crit: false, dodged: true, heal: false, absorbed: 0, school: ab.school });
        world.addThreat(target, caster, 1);
        const od = passiveValue(target, 'onDodge');
        if (od) target.comboBonusNext = od.nextComboBonus;
        return;
      }
      let amount = r.amount;
      let blocked = false;
      if (isMeleePhysical(ab) && target.stats.blockChance > 0 && world.rng() < target.stats.blockChance) {
        blocked = true;
        amount = Math.max(1, Math.round(amount * (1 - BALANCE.combat.blockReduction)));
      }
      const dealt = world.damage(target, amount, caster, ab.school, r.crit, { blocked });
      if (blocked) onBlock(world, target);
      if (!ctx.fromProc) afterDamageDealt(world, caster, target, ab, dealt, r.crit);
      return;
    }
    case 'heal': {
      const r = rollHeal({
        base: e.base + (e.pctMaxHp ?? 0) * target.stats.maxHp,
        coef: e.coef,
        power: caster.stats.spellPower,
        critChance: caster.stats.critChance,
        healMult: caster.stats.healingDone * target.stats.healingReceived,
        critBonus: caster.stats.critDamage,
        rng: world.rng,
      });
      world.heal(target, r.amount, caster, ab.school, r.crit);
      const echo = passiveValue(caster, 'healEcho');
      if (echo && r.amount > 0) {
        const ticks = Math.max(1, Math.floor(echo.durationMs / echo.tickMs));
        const per = Math.max(1, Math.round((r.amount * echo.pct) / ticks));
        target.statuses.push({ kind: 'hot', until: now + echo.durationMs, sourceId: caster.id, amount: per, tickMs: echo.tickMs, nextTick: now + echo.tickMs, school: ab.school });
      }
      return;
    }
    case 'shield':
      target.statuses = target.statuses.filter((s) => s.kind !== 'shield');
      target.statuses.push({ kind: 'shield', until: now + e.durationMs, sourceId: caster.id, amount: Math.round(e.base + e.coef * caster.stats.spellPower) });
      return;
    case 'buff':
    case 'debuff':
      if (invuln && e.type === 'debuff') return;
      target.statuses.push({ kind: e.type, until: now + e.durationMs, sourceId: caster.id, stat: e.stat, pct: e.pct, flat: e.flat });
      recomputeStats(target, now);
      return;
    case 'dot':
    case 'hot': {
      const amount = Math.max(1, Math.round(e.base + e.coef * powerFor(caster, ab, now)));
      if (e.stackMax) {
        const s = target.statuses.find((x) => x.kind === e.type && x.abilityId === ab.id && x.sourceId === caster.id && x.until > now);
        if (s) {
          s.stacks = Math.min(e.stackMax, (s.stacks ?? 1) + 1);
          s.amount = amount * s.stacks;
          s.until = now + e.durationMs;
          return;
        }
      }
      target.statuses.push({
        kind: e.type,
        until: now + e.durationMs,
        sourceId: caster.id,
        amount,
        tickMs: e.tickMs,
        nextTick: now + e.tickMs,
        school: ab.school,
        abilityId: ab.id,
        stacks: 1,
      });
      return;
    }
    case 'stun':
    case 'root':
    case 'freeze':
    case 'taunt':
      if (invuln && e.type !== 'root') return;
      target.statuses.push({ kind: e.type, until: now + e.durationMs, sourceId: caster.id });
      if (e.type !== 'taunt') {
        target.dash = target.kind === 'monster' ? null : target.dash;
        target.moving = false;
      }
      if (e.type === 'freeze') {
        const of = passiveValue(caster, 'onFreeze');
        if (of) reduceCooldown(caster, of.cdReduce.abilityId, of.cdReduce.ms);
      }
      return;
    case 'slow':
      if (invuln) return;
      target.statuses.push({ kind: 'slow', until: now + e.durationMs, sourceId: caster.id, pct: e.pct, attackSlowPct: passiveValue(caster, 'chill')?.attackSlowPct });
      recomputeStats(target, now);
      return;
    case 'resource':
      gainResource(world, target, e.amount);
      return;
    case 'reflect':
      target.statuses = target.statuses.filter((s) => s.kind !== 'reflect');
      target.statuses.push({ kind: 'reflect', until: now + e.durationMs, sourceId: caster.id, pct: e.pct });
      return;
    case 'invuln':
      target.invulnUntil = Math.max(target.invulnUntil, now + e.durationMs);
      return;
    case 'stealth':
      if (target.inCombatUntil > now) {
        world.dropFromThreat(target.id);
        target.inCombatUntil = 0;
      }
      target.statuses = target.statuses.filter((s) => s.kind !== 'stealth');
      target.statuses.push({ kind: 'stealth', until: now + e.durationMs, sourceId: caster.id });
      return;
    case 'imbue':
      target.statuses = target.statuses.filter((s) => !(s.kind === 'imbue' && s.abilityId === e.abilityId));
      target.statuses.push({ kind: 'imbue', until: now + e.durationMs, sourceId: caster.id, abilityId: e.abilityId });
      return;
    case 'revive':
      if (target.state !== 'downed') return;
      target.state = 'alive';
      target.hp = Math.max(1, Math.round(target.stats.maxHp * e.hpPct));
      world.emit({ e: 'revived', id: target.id });
      return;
  }
}

/** Lifesteal, atonement, on-crit procs and weapon imbues after a hit lands. */
function afterDamageDealt(world: World, caster: Unit, target: Unit, ab: AbilityDef, dealt: number, crit: boolean): void {
  if (dealt <= 0 || caster.state !== 'alive') return;
  if (caster.stats.lifesteal > 0) world.heal(caster, Math.round(dealt * caster.stats.lifesteal), caster, 'physical');
  const at = passiveValue(caster, 'atonement');
  if (at) {
    let best = caster;
    for (const p of world.allUnits()) {
      if (p.team !== caster.team || p.state !== 'alive' || dist(p.pos, caster.pos) > at.range) continue;
      if (p.hp / p.stats.maxHp < best.hp / best.stats.maxHp) best = p;
    }
    world.heal(best, Math.round(dealt * at.pct), caster, 'holy');
  }
  if (crit) {
    for (const p of passivesWith(caster, 'onCrit')) {
      const oc = p.onCrit;
      if (oc.school && oc.school !== ab.school) continue;
      if (oc.healPctMaxHp) world.heal(caster, Math.round(caster.stats.maxHp * oc.healPctMaxHp), caster, ab.school);
      if (oc.cdReduce) reduceCooldown(caster, oc.cdReduce.abilityId, oc.cdReduce.ms);
      const extra = oc.applyAbility ? ability(oc.applyAbility) : undefined;
      if (extra && target.state === 'alive') applyEffects(world, caster, target, extra, { fromProc: true });
    }
  }
  for (const s of caster.statuses) {
    if (s.kind !== 'imbue' || s.until <= world.now || !s.abilityId || s.abilityId === ab.id) continue;
    const proc = ability(s.abilityId);
    if (proc && target.state === 'alive') applyEffects(world, caster, target, proc, { fromProc: true });
  }
}

function onBlock(world: World, u: Unit): void {
  const ob = passiveValue(u, 'onBlock');
  if (!ob || u.state !== 'alive') return;
  gainResource(world, u, ob.rage);
  world.heal(u, Math.round(u.stats.maxHp * ob.healPctMaxHp), u, 'physical');
}

function reduceCooldown(u: Unit, abilityId: string, ms: number): void {
  if (u.cooldowns[abilityId] !== undefined) u.cooldowns[abilityId] -= ms;
}

export function breakStealth(world: World, u: Unit): void {
  if (!u.statuses.some((s) => s.kind === 'stealth')) return;
  u.statuses = u.statuses.filter((s) => s.kind !== 'stealth');
  recomputeStats(u, world.now);
}

export function gainResource(world: World, u: Unit, amount: number): void {
  u.resource = Math.max(0, Math.min(u.stats.maxResource, u.resource + amount));
  if (u.resourceKind === 'rage' && amount > 0) u.lastRageGainAt = world.now;
}

/** Advances a unit's dash by one tick; applies contact/end effects. Returns true while dashing. */
export function stepDash(world: World, u: Unit): boolean {
  const d = u.dash;
  if (!d) return false;
  const before = u.pos;
  u.pos = moveCircle(u.pos, u.radius, d.dx, d.dy, world.map);
  d.ticksLeft--;
  const blocked = Math.hypot(u.pos.x - before.x - d.dx, u.pos.y - before.y - d.dy) > 0.5;
  const ab = d.abilityId ? ability(d.abilityId) : undefined;
  if (ab && d.stopOnHit) {
    const hit = world.allUnits().find((t) => t.state === 'alive' && isEnemy(u, t) && dist(u.pos, t.pos) <= u.radius + t.radius + 6);
    if (hit) {
      if (applyEffects(world, u, hit, ab)) onAbilityHit(world, u, ab);
      u.dash = null;
      return false;
    }
  }
  if (d.ticksLeft <= 0 || blocked) {
    u.dash = null;
    if (ab?.then && d.aim) useAbility(world, u, ab.then, d.aim, true);
    return false;
  }
  return true;
}

/** Channels: resolve at the end or every tick; stun, freeze or death cancel them. */
export function stepChannels(world: World): void {
  const now = world.now;
  for (const u of world.allUnits()) {
    const c = u.channel;
    if (!c) continue;
    const ab = ability(c.abilityId);
    if (!ab || cannotAct(u, now)) {
      u.channel = null;
      continue;
    }
    while (c.nextTick <= now && c.nextTick <= c.until) {
      resolveAbility(world, u, ab, c.aim, c.ctx);
      c.ctx = { comboSpent: c.ctx.comboSpent };
      c.nextTick += ab.channelTickMs ?? Infinity;
    }
    if (now >= c.until) {
      u.channel = null;
      if (!ab.channelTickMs) resolveAbility(world, u, ab, c.aim, c.ctx);
    }
  }
}

/** Moves projectiles one tick: walls end them; hits apply the ability (or explode); pierce keeps going. */
export function stepProjectiles(world: World): void {
  const keep: Projectile[] = [];
  for (const p of world.projectiles) {
    const caster = world.getUnit(p.casterId);
    const ab = ability(p.abilityId);
    let alive = !!caster && !!ab;
    const sub = 4;
    for (let i = 0; i < sub && alive && caster && ab; i++) {
      p.pos = { x: p.pos.x + (p.vel.x * TICK_SEC) / sub, y: p.pos.y + (p.vel.y * TICK_SEC) / sub };
      p.distLeft -= (len(p.vel) * TICK_SEC) / sub;
      if (world.map.isSolidAt(p.pos.x, p.pos.y) || p.distLeft <= 0) {
        alive = false;
        explode(world, caster, ab, p);
        break;
      }
      const target = world
        .allUnits()
        .find((t) => t.state === 'alive' && isEnemy(caster, t) && !p.hit.includes(t.id) && bodyDistance(t, p.pos) <= t.radius + p.radius);
      if (!target) continue;
      const shape = ab.shape.type === 'projectile' ? ab.shape : null;
      if (shape?.explodeRadius) {
        explode(world, caster, ab, p);
        alive = false;
        break;
      }
      if (applyEffects(world, caster, target, ab, p.ctx)) onAbilityHit(world, caster, ab);
      p.hit.push(target.id);
      if (!shape?.pierce) alive = false;
    }
    if (alive) keep.push(p);
    else world.emit({ e: 'projEnd', id: p.id, x: p.pos.x, y: p.pos.y });
  }
  world.projectiles = keep;
}

function explode(world: World, caster: Unit, ab: AbilityDef, p: Projectile): void {
  const r = ab.shape.type === 'projectile' ? ab.shape.explodeRadius : undefined;
  if (!r) return;
  if (applyArea(world, caster, ab, p.pos, r, p.ctx)) onAbilityHit(world, caster, ab);
  world.emit({ e: 'area', x: p.pos.x, y: p.pos.y, r, school: ab.school });
}

/** Resolves delayed areas whose time has come. */
export function stepAreas(world: World): void {
  const keep: PendingArea[] = [];
  for (const a of world.areas) {
    if (a.at > world.now) {
      keep.push(a);
      continue;
    }
    const caster = world.getUnit(a.casterId);
    const ab = ability(a.abilityId);
    if (caster && ab) {
      applyArea(world, caster, ab, a.center, a.radius, a.ctx);
      world.emit({ e: 'area', x: a.center.x, y: a.center.y, r: a.radius, school: ab.school });
    }
  }
  world.areas = keep;
}

/** Persistent zones tick their effects; they vanish when they expire or their caster leaves. */
export function stepZones(world: World): void {
  const now = world.now;
  world.zones = world.zones.filter((z) => {
    const caster = world.getUnit(z.casterId);
    const ab = ability(z.abilityId);
    if (!caster || !ab || z.until <= now) return false;
    while (z.nextTick <= now) {
      applyArea(world, caster, ab, z.center, z.radius, {});
      z.nextTick += z.tickMs;
    }
    return true;
  });
}
