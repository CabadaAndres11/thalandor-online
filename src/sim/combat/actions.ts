import { moveCircle } from '../movement';
import { facingFromVector } from '../facing';
import type { EntityId, Vec2 } from '../types';
import type { World } from '../world';
import { ability, BALANCE, type AbilityDef, type EffectDef } from './defs';
import { rollDamage, rollHeal } from './damage';
import { cannotAct, isEnemy, passiveValue, recomputeStats, type Unit } from './unit';

export type UseResult = 'ok' | 'unknown' | 'control' | 'cooldown' | 'gcd' | 'resource' | 'range';

export interface Projectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  distLeft: number;
  casterId: EntityId;
  abilityId: string;
}

export interface PendingArea {
  at: number;
  center: Vec2;
  radius: number;
  casterId: EntityId;
  abilityId: string;
}

const TICK_SEC = 0.05;
const len = (v: Vec2) => Math.hypot(v.x, v.y);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function dirTo(from: Vec2, to: Vec2, fallback: Vec2 = { x: 0, y: 1 }): Vec2 {
  const d = { x: to.x - from.x, y: to.y - from.y };
  const l = len(d);
  return l < 1e-6 ? fallback : { x: d.x / l, y: d.y / l };
}

/** Checks whether a unit can use an ability right now (without using it). */
export function checkUse(world: World, u: Unit, ab: AbilityDef): UseResult {
  if (cannotAct(u, world.now)) return 'control';
  if ((u.cooldowns[ab.id] ?? 0) > world.now) return 'cooldown';
  if (ab.gcd && u.gcdUntil > world.now) return 'gcd';
  if (ab.cost > u.resource + 1e-9) return 'resource';
  return 'ok';
}

/** Validates and executes an ability for a unit aiming at `aim` (world coordinates). */
export function useAbility(world: World, u: Unit, abilityId: string, aim: Vec2, free = false): UseResult {
  const ab = ability(abilityId);
  if (!ab) return 'unknown';
  if (!free) {
    const r = checkUse(world, u, ab);
    if (r !== 'ok') return r;
    u.resource -= ab.cost;
    u.cooldowns[ab.id] = world.now + ab.cooldownMs;
    if (ab.gcd) u.gcdUntil = world.now + BALANCE.combat.gcdMs;
  }
  const dir = dirTo(u.pos, aim, { x: 0, y: 1 });
  u.facing = facingFromVector(dir.x, dir.y, u.facing);
  if (ab.anim !== 'none') {
    u.action = { anim: ab.anim, at: world.now };
    world.emit({ e: 'cast', src: u.id, anim: ab.anim, facing: u.facing });
  }
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
        if (applyEffects(world, u, t, ab)) hitEnemy = true;
      }
      break;
    }
    case 'area_self':
      hitEnemy = applyArea(world, u, ab, u.pos, shape.radius);
      world.emit({ e: 'area', x: u.pos.x, y: u.pos.y, r: shape.radius, school: ab.school });
      break;
    case 'area_target': {
      let center = shape.atSelf ? { ...u.pos } : { ...aim };
      if (!shape.atSelf && dist(u.pos, center) > ab.range) center = { x: u.pos.x + dir.x * ab.range, y: u.pos.y + dir.y * ab.range };
      if (shape.delayMs > 0) {
        world.areas.push({ at: world.now + shape.delayMs, center, radius: shape.radius, casterId: u.id, abilityId: ab.id });
        world.emit({ e: 'tele', x: center.x, y: center.y, r: shape.radius, ms: shape.delayMs, hostile: u.team === 'monsters' });
      } else {
        hitEnemy = applyArea(world, u, ab, center, shape.radius);
        world.emit({ e: 'area', x: center.x, y: center.y, r: shape.radius, school: ab.school });
      }
      break;
    }
    case 'projectile': {
      const p: Projectile = {
        id: world.nextProjectileId(),
        pos: { x: u.pos.x + dir.x * (u.radius + 2), y: u.pos.y + dir.y * (u.radius + 2) },
        vel: { x: dir.x * shape.speed, y: dir.y * shape.speed },
        radius: shape.radius,
        distLeft: ab.range,
        casterId: u.id,
        abilityId: ab.id,
      };
      world.projectiles.push(p);
      world.emit({ e: 'proj', id: p.id, x: p.pos.x, y: p.pos.y, vx: p.vel.x, vy: p.vel.y, look: shape.look, ttlMs: (ab.range / shape.speed) * 1000 });
      break;
    }
    case 'ally_target': {
      const target = pickAlly(world, u, aim, ab.range) ?? u;
      applyEffects(world, u, target, ab);
      break;
    }
    case 'self':
      applyEffects(world, u, u, ab);
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
  if (hitEnemy && ab.gainOnHit) gainResource(world, u, ab.gainOnHit);
  return 'ok';
}

function pickAlly(world: World, u: Unit, aim: Vec2, range: number): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const t of world.allUnits()) {
    // The caster is the fallback target, never a candidate: an ally standing on top of it must win.
    if (t === u || t.team !== u.team || t.state !== 'alive') continue;
    const d = dist(t.pos, aim);
    if (d <= BALANCE.combat.allyPickRadius + t.radius && d < bestD && dist(u.pos, t.pos) <= range) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function applyArea(world: World, u: Unit, ab: AbilityDef, center: Vec2, radius: number): boolean {
  let hit = false;
  for (const t of world.allUnits()) {
    if (t.state !== 'alive' || dist(center, t.pos) > radius + t.radius) continue;
    if (applyEffects(world, u, t, ab)) hit = true;
  }
  return hit;
}

const defaultTo = (e: EffectDef) =>
  e.to ?? (e.type === 'heal' || e.type === 'hot' || e.type === 'shield' || e.type === 'buff' ? 'allies' : 'enemies');

/** Applies every effect of an ability that targets this unit's relation (enemy/ally/self). Returns true if an enemy was hit. */
export function applyEffects(world: World, caster: Unit, target: Unit, ab: AbilityDef): boolean {
  const enemy = isEnemy(caster, target);
  let hitEnemy = false;
  for (const e of ab.effects) {
    const to = defaultTo(e);
    if (to === 'enemies' && !enemy) continue;
    if (to === 'allies' && enemy) continue;
    if (to === 'self' && target !== caster) continue;
    if (enemy) hitEnemy = true;
    applyEffect(world, caster, target, ab, e);
  }
  return hitEnemy;
}

function powerFor(caster: Unit, ab: AbilityDef, now: number): number {
  let p = ab.school === 'physical' ? caster.stats.attackPower : caster.stats.spellPower;
  const conc = passiveValue(caster, 'concentration');
  if (conc && ab.school !== 'physical' && now - caster.lastHurtAt >= conc.afterMs) p *= 1 + conc.spellDamagePct;
  return p;
}

function applyEffect(world: World, caster: Unit, target: Unit, ab: AbilityDef, e: EffectDef): void {
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
        dmgMult: caster.stats.damageDone * target.stats.damageTaken,
        rng: world.rng,
      });
      if (r.dodged) {
        world.emit({ e: 'hit', src: caster.id, dst: target.id, amount: 0, crit: false, dodged: true, heal: false, absorbed: 0, school: ab.school });
        world.addThreat(target, caster, 1);
        return;
      }
      world.damage(target, r.amount, caster, ab.school, r.crit);
      return;
    }
    case 'heal': {
      const r = rollHeal({
        base: e.base,
        coef: e.coef,
        power: caster.stats.spellPower,
        critChance: caster.stats.critChance,
        healMult: caster.stats.healingDone * target.stats.healingReceived,
        rng: world.rng,
      });
      world.heal(target, r.amount, caster, ab.school, r.crit);
      return;
    }
    case 'shield':
      target.statuses = target.statuses.filter((s) => s.kind !== 'shield');
      target.statuses.push({ kind: 'shield', until: now + e.durationMs, sourceId: caster.id, amount: Math.round(e.base + e.coef * caster.stats.spellPower) });
      return;
    case 'buff':
    case 'debuff':
      if (invuln && e.type === 'debuff') return;
      target.statuses.push({ kind: e.type, until: now + e.durationMs, sourceId: caster.id, stat: e.stat, pct: e.pct });
      recomputeStats(target, now);
      return;
    case 'dot':
    case 'hot':
      target.statuses.push({
        kind: e.type,
        until: now + e.durationMs,
        sourceId: caster.id,
        amount: Math.max(1, Math.round(e.base + e.coef * powerFor(caster, ab, now))),
        tickMs: e.tickMs,
        nextTick: now + e.tickMs,
        school: ab.school,
      });
      return;
    case 'stun':
    case 'root':
    case 'freeze':
    case 'taunt':
      if (invuln) return;
      target.statuses.push({ kind: e.type, until: now + e.durationMs, sourceId: caster.id });
      if (e.type !== 'taunt') {
        target.dash = target.kind === 'monster' ? null : target.dash;
        target.moving = false;
      }
      return;
    case 'slow':
      if (invuln) return;
      target.statuses.push({ kind: 'slow', until: now + e.durationMs, sourceId: caster.id, pct: e.pct });
      recomputeStats(target, now);
      return;
    case 'resource':
      gainResource(world, target, e.amount);
      return;
  }
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
      if (applyEffects(world, u, hit, ab) && ab.gainOnHit) gainResource(world, u, ab.gainOnHit);
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

/** Moves projectiles one tick: walls end them, the first enemy hit receives the ability's effects. */
export function stepProjectiles(world: World): void {
  const keep: Projectile[] = [];
  for (const p of world.projectiles) {
    const caster = world.getUnit(p.casterId);
    const ab = ability(p.abilityId);
    let alive = !!caster && !!ab;
    const sub = 4;
    for (let i = 0; i < sub && alive; i++) {
      p.pos = { x: p.pos.x + (p.vel.x * TICK_SEC) / sub, y: p.pos.y + (p.vel.y * TICK_SEC) / sub };
      p.distLeft -= (len(p.vel) * TICK_SEC) / sub;
      if (world.map.isSolidAt(p.pos.x, p.pos.y) || p.distLeft <= 0) {
        alive = false;
        break;
      }
      const target = world.allUnits().find((t) => t.state === 'alive' && caster && isEnemy(caster, t) && dist(t.pos, p.pos) <= t.radius + p.radius);
      if (target && caster && ab) {
        applyEffects(world, caster, target, ab);
        if (ab.gainOnHit) gainResource(world, caster, ab.gainOnHit);
        alive = false;
      }
    }
    if (alive) keep.push(p);
    else world.emit({ e: 'projEnd', id: p.id, x: p.pos.x, y: p.pos.y });
  }
  world.projectiles = keep;
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
      applyArea(world, caster, ab, a.center, a.radius);
      world.emit({ e: 'area', x: a.center.x, y: a.center.y, r: a.radius, school: ab.school });
    }
  }
  world.areas = keep;
}
