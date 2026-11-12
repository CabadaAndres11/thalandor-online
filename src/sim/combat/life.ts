import type { World } from '../world';
import { ability, BALANCE, MONSTERS, type PassiveDef, type School } from './defs';
import { BUTTON, passivesWith, passiveValue, recomputeStats, type Unit } from './unit';
import { breakStealth, useAbility } from './actions';

const TICK_SEC = 0.05;
const dist = (a: Unit, b: Unit) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);

function enterCombat(world: World, u: Unit): void {
  u.inCombatUntil = world.now + BALANCE.combat.outOfCombatMs;
}

export interface DamageOpts {
  blocked?: boolean;
  /** Reflected damage is not reflected again. */
  reflected?: boolean;
}

/**
 * Applies damage (after rolls): shields absorb first, then health; handles rage, threat, combat,
 * stealth, reflect, low-health and cheat-death passives, and death. Returns the damage taken (incl. absorbed).
 */
export function applyDamage(world: World, target: Unit, amount: number, src: Unit | null, school: School, crit = false, opts: DamageOpts = {}): number {
  if (target.state !== 'alive' || amount <= 0) return 0;
  if (target.invulnUntil > world.now) {
    world.emit({ e: 'hit', src: src?.id ?? null, dst: target.id, amount: 0, crit: false, dodged: true, heal: false, absorbed: 0, school });
    return 0;
  }
  breakStealth(world, target);
  let rest = amount;
  let absorbed = 0;
  for (const s of target.statuses) {
    if (s.kind !== 'shield' || s.until <= world.now || !s.amount) continue;
    const a = Math.min(s.amount, rest);
    s.amount -= a;
    rest -= a;
    absorbed += a;
    if (rest <= 0) break;
  }
  target.statuses = target.statuses.filter((s) => s.kind !== 'shield' || (s.amount ?? 0) > 0);
  const hpBefore = target.hp;
  target.hp = Math.max(0, target.hp - rest);
  target.lastHurtAt = world.now;
  if (target.reviving) target.reviving = null;
  enterCombat(world, target);
  if (src) enterCombat(world, src);
  world.emit({ e: 'hit', src: src?.id ?? null, dst: target.id, amount: rest, crit, dodged: false, heal: false, absorbed, school, ...(opts.blocked ? { blocked: true } : {}) });
  if (target.resourceKind === 'rage' && rest > 0) {
    const gain = (rest / target.stats.maxHp) * 100 * BALANCE.resources.rage.perDamageTakenPct;
    target.resource = Math.min(target.stats.maxResource, target.resource + gain);
    target.lastRageGainAt = world.now;
  }
  if (src && target.kind === 'monster') world.addThreat(target, src, amount);
  const reflect = target.statuses.find((s) => s.kind === 'reflect' && s.until > world.now);
  if (reflect?.pct && src && src !== target && !opts.reflected && rest + absorbed > 0) {
    applyDamage(world, src, Math.max(1, Math.round((rest + absorbed) * reflect.pct)), target, school, false, { reflected: true });
  }
  if (target.hp <= 0 && !cheatDeath(world, target)) kill(world, target, src);
  else if (target.hp > 0) lowHealth(world, target, hpBefore);
  return rest + absorbed;
}

const procReady = (world: World, u: Unit, id: string) => (u.procCd[id] ?? 0) <= world.now;

/** Last-stand style passives: cast a self ability when health crosses below a threshold. */
function lowHealth(world: World, u: Unit, hpBefore: number): void {
  for (const p of passivesWith(u, 'onLowHp')) {
    const t = u.stats.maxHp * p.onLowHp.belowPct;
    if (hpBefore < t || u.hp >= t || !procReady(world, u, p.id) || !ability(p.onLowHp.abilityId)) continue;
    u.procCd[p.id] = world.now + p.onLowHp.cooldownMs;
    useAbility(world, u, p.onLowHp.abilityId, u.pos, true);
    world.emit({ e: 'proc', id: u.id, passiveId: p.id });
  }
}

/** A lethal hit: the target's own cheat-death passive, or an ally's guardian one, may save it. */
function cheatDeath(world: World, u: Unit): boolean {
  if (u.kind !== 'player') return false;
  const candidates: [Unit, PassiveDef & { cheatDeath: NonNullable<PassiveDef['cheatDeath']> }][] = [];
  for (const p of passivesWith(u, 'cheatDeath')) if (!p.cheatDeath.allies) candidates.push([u, p]);
  for (const ally of world.allPlayers()) {
    if (ally === u || ally.state !== 'alive') continue;
    for (const p of passivesWith(ally, 'cheatDeath')) if (p.cheatDeath.allies) candidates.push([ally, p]);
  }
  for (const [owner, p] of candidates) {
    if (!procReady(world, owner, p.id)) continue;
    owner.procCd[p.id] = world.now + p.cheatDeath.cooldownMs;
    u.hp = Math.max(1, Math.round(u.stats.maxHp * p.cheatDeath.hpPct));
    world.emit({ e: 'proc', id: u.id, passiveId: p.id });
    return true;
  }
  return false;
}

/** Applies a heal and gives healing threat to monsters fighting the healer. */
export function applyHeal(world: World, target: Unit, amount: number, src: Unit | null, school: School, crit = false): void {
  if (target.state !== 'alive' || amount <= 0) return;
  const real = Math.min(amount, target.stats.maxHp - target.hp);
  target.hp += real;
  world.emit({ e: 'hit', src: src?.id ?? null, dst: target.id, amount: real, crit, dodged: false, heal: true, absorbed: 0, school });
  if (src && real > 0) {
    const engaged = world.allUnits().filter((m) => m.kind === 'monster' && m.state === 'alive' && m.ai?.threat.has(src.id));
    for (const m of engaged) world.addThreat(m, src, (real * BALANCE.combat.healThreatFactor) / engaged.length);
  }
}

function kill(world: World, u: Unit, src: Unit | null = null): void {
  u.dash = null;
  u.reviving = null;
  u.channel = null;
  u.combo = 0;
  u.comboBonusNext = 0;
  u.statuses = [];
  if (src && src.kind === 'player') for (const p of passivesWith(src, 'onKill')) delete src.cooldowns[p.onKill.resetCooldown];
  recomputeStats(u, world.now);
  if (u.kind === 'monster') {
    u.state = 'dead';
    u.diedAt = world.now;
    world.emit({ e: 'died', id: u.id });
    world.onMonsterDied(u);
    return;
  }
  world.dropFromThreat(u.id);
  const othersUp = world.allPlayers().some((p) => p !== u && p.state === 'alive');
  if (othersUp) {
    u.state = 'downed';
    u.downedUntil = world.now + BALANCE.death.downedMs;
    world.emit({ e: 'downed', id: u.id });
  } else {
    die(world, u);
    // Nobody left standing: every downed player dies too.
    for (const p of world.allPlayers()) if (p.state === 'downed') die(world, p);
  }
}

function die(world: World, u: Unit): void {
  u.state = 'dead';
  u.diedAt = world.now;
  u.respawnAt = world.now + BALANCE.death.respawnDelayMs;
  world.emit({ e: 'died', id: u.id });
}

function respawn(world: World, u: Unit): void {
  u.state = 'alive';
  u.pos = { ...world.spawn };
  u.statuses = [];
  recomputeStats(u, world.now);
  u.hp = u.stats.maxHp;
  u.resource = u.resourceKind === 'rage' ? 0 : u.stats.maxResource;
  u.inCombatUntil = 0;
  u.cooldowns = {};
  world.emit({ e: 'respawned', id: u.id });
}

/** Per-tick life cycle: downed timeouts, respawns, revive channels. */
export function stepLife(world: World): void {
  const now = world.now;
  for (const p of world.allPlayers()) {
    if (p.state === 'downed' && p.downedUntil <= now) die(world, p);
    if (p.state === 'dead' && p.respawnAt <= now) respawn(world, p);
  }
  for (const p of world.allPlayers()) {
    if (p.state !== 'alive') {
      p.reviving = null;
      continue;
    }
    const holding = (p.held & BUTTON.interact) !== 0;
    if (!holding || p.moving) {
      p.reviving = null;
      continue;
    }
    if (p.reviving) {
      const t = world.getUnit(p.reviving.targetId);
      if (!t || t.state !== 'downed' || dist(p, t) > BALANCE.death.reviveRange + t.radius) {
        p.reviving = null;
        continue;
      }
      if (now - p.reviving.since >= BALANCE.death.reviveMs) {
        t.state = 'alive';
        t.hp = Math.round(t.stats.maxHp * BALANCE.death.reviveHpPct);
        p.reviving = null;
        world.emit({ e: 'revived', id: t.id });
      }
      continue;
    }
    const target = world.allPlayers().find((t) => t.state === 'downed' && dist(p, t) <= BALANCE.death.reviveRange + t.radius);
    if (target) p.reviving = { targetId: target.id, since: now };
  }
}

/** Per-tick statuses (expiry, dots/hots) and resources/regeneration. */
export function stepStatusesAndResources(world: World): void {
  const now = world.now;
  for (const u of world.allUnits()) {
    if (u.state !== 'alive') continue;
    let changed = false;
    for (const s of u.statuses) {
      if ((s.kind === 'dot' || s.kind === 'hot') && s.nextTick !== undefined && s.tickMs && s.amount) {
        while (s.nextTick <= now && s.nextTick <= s.until) {
          const src = world.getUnit(s.sourceId) ?? null;
          if (s.kind === 'dot') applyDamage(world, u, s.amount, src, s.school ?? 'physical');
          else applyHeal(world, u, s.amount, src, s.school ?? 'holy');
          s.nextTick += s.tickMs;
        }
      }
    }
    const before = u.statuses.length;
    u.statuses = u.statuses.filter((s) => s.until > now);
    if (u.statuses.length !== before) changed = true;
    if (changed) recomputeStats(u, now);
    if (u.state !== 'alive') continue;

    const inCombat = u.inCombatUntil > now;
    if (u.kind === 'player') {
      if (!inCombat) u.hp = Math.min(u.stats.maxHp, u.hp + (u.stats.maxHp * BALANCE.combat.outOfCombatHealthRegenPct + u.stats.hpRegen) * TICK_SEC);
      if (u.resourceKind === 'energy') u.resource = Math.min(u.stats.maxResource, u.resource + BALANCE.resources.energy.regenPerSec * TICK_SEC);
      if (u.resourceKind === 'mana') {
        const factor = inCombat ? (passiveValue(u, 'combatManaRegenFactor') ?? BALANCE.resources.mana.inCombatRegenFactor) : 1;
        u.resource = Math.min(u.stats.maxResource, u.resource + u.stats.manaRegen * factor * TICK_SEC);
      }
      if (u.resourceKind === 'rage') {
        const r = BALANCE.resources.rage;
        const decayFrom = Math.max(u.inCombatUntil, u.lastRageGainAt + r.decayDelayMs);
        if (now >= decayFrom) u.resource = Math.max(0, u.resource - r.decayPerSec * (passiveValue(u, 'rageDecayFactor') ?? 1) * TICK_SEC);
      }
    }
  }
}

/** Group scaling factor for monster health (GDD §5). */
export function monsterHpScale(players: number): number {
  return 1 + BALANCE.monsters.groupHpPerExtraPlayer * Math.max(0, players - 1);
}

/** Applies a new health scale to a monster, keeping its health percentage. */
export function rescaleMonster(m: Unit, scale: number, now: number): void {
  const def = MONSTERS[m.monsterType ?? ''];
  if (!def) return;
  const pct = m.stats.maxHp > 0 ? m.hp / m.stats.maxHp : 1;
  m.baseStats = { ...m.baseStats, maxHp: def.stats.maxHp * scale };
  recomputeStats(m, now);
  m.hp = m.stats.maxHp * pct;
}
