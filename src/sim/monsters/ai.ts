import { moveCircle } from '../movement';
import { facingFromVector } from '../facing';
import type { Vec2 } from '../types';
import type { World } from '../world';
import { checkUse, useAbility } from '../combat/actions';
import { ability, BALANCE, MONSTERS } from '../combat/defs';
import { cannotAct, cannotMove, type Unit } from '../combat/unit';
import { findPath, lineOfSight } from './path';

const TICK_SEC = 0.05;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function moveToward(world: World, m: Unit, target: Vec2, speedFactor = 1): void {
  const d = dist(m.pos, target);
  if (d < 1) return;
  const step = Math.min(d, m.stats.moveSpeed * speedFactor * TICK_SEC);
  const dx = ((target.x - m.pos.x) / d) * step;
  const dy = ((target.y - m.pos.y) / d) * step;
  m.pos = moveCircle(m.pos, m.radius, dx, dy, world.map);
  m.facing = facingFromVector(dx, dy, m.facing);
  m.moving = true;
}

/** Follows a cached A* path to `goal`, repathing every few hundred ms. */
function pathTo(world: World, m: Unit, goal: Vec2, speedFactor = 1): void {
  const ai = m.ai!;
  if (world.now >= ai.nextRepathAt || ai.path.length === 0) {
    ai.path = findPath(world.map, m.pos, goal);
    ai.nextRepathAt = world.now + BALANCE.monsters.repathMs;
  }
  while (ai.path.length > 1 && dist(m.pos, ai.path[0]!) < 6) ai.path.shift();
  const next = ai.path[0];
  if (next) moveToward(world, m, next, speedFactor);
}

function startReturn(world: World, m: Unit): void {
  const ai = m.ai!;
  ai.state = 'return';
  ai.threat.clear();
  ai.path = [];
  m.hp = m.stats.maxHp;
  m.statuses = m.statuses.filter((s) => s.kind !== 'dot' && s.kind !== 'debuff' && s.kind !== 'slow');
  m.inCombatUntil = 0;
}

/** One AI tick for a monster: idle wandering, aggro, chase/attack, leash and return. */
export function stepMonster(world: World, m: Unit): void {
  const ai = m.ai;
  const def = MONSTERS[m.monsterType ?? ''];
  if (!ai || !def || m.state !== 'alive') return;
  m.moving = false;
  const now = world.now;

  if (ai.state === 'idle') {
    const seen = world
      .allPlayers()
      .filter((p) => p.state === 'alive' && dist(p.pos, m.pos) <= def.aggroRange && lineOfSight(world.map, m.pos, p.pos))
      .sort((a, b) => dist(a.pos, m.pos) - dist(b.pos, m.pos))[0];
    if (seen) {
      world.addThreat(m, seen, 1);
    } else {
      if (cannotMove(m, now)) return;
      if (now >= ai.nextWanderAt) {
        const a = world.rng() * Math.PI * 2;
        const r = world.rng() * BALANCE.monsters.wanderRadius;
        ai.wanderTo = { x: ai.spawn.x + Math.cos(a) * r, y: ai.spawn.y + Math.sin(a) * r };
        ai.nextWanderAt = now + BALANCE.monsters.wanderEveryMs;
      }
      if (ai.wanderTo && dist(m.pos, ai.wanderTo) > 4) moveToward(world, m, ai.wanderTo, 0.4);
      return;
    }
  }

  if (ai.state === 'return') {
    if (dist(m.pos, ai.spawn) <= 8) {
      ai.state = 'idle';
      ai.path = [];
      ai.nextWanderAt = now + BALANCE.monsters.wanderEveryMs;
      return;
    }
    if (!cannotMove(m, now)) pathTo(world, m, ai.spawn, 1.3);
    return;
  }

  // combat
  const target = world.topTarget(m);
  if (!target || dist(m.pos, ai.spawn) > def.leashRange) {
    startReturn(world, m);
    return;
  }
  m.inCombatUntil = now + BALANCE.combat.outOfCombatMs;
  const d = dist(m.pos, target.pos);
  if (!cannotAct(m, now)) {
    for (const id of def.abilities) {
      const ab = ability(id);
      if (!ab || checkUse(world, m, ab) !== 'ok') continue;
      if (d > ab.range + target.radius) continue;
      if (ab.shape.type === 'projectile' && !lineOfSight(world.map, m.pos, target.pos)) continue;
      useAbility(world, m, id, target.pos);
      return;
    }
  }
  if (cannotMove(m, now)) return;
  if (def.behavior === 'ranged') {
    const keep = def.keepDistance ?? 160;
    if (d < keep - 30) {
      const away = { x: m.pos.x + (m.pos.x - target.pos.x), y: m.pos.y + (m.pos.y - target.pos.y) };
      moveToward(world, m, away);
      return;
    }
    const mainRange = ability(def.abilities[0]!)?.range ?? keep;
    if (d > mainRange - 20 || !lineOfSight(world.map, m.pos, target.pos)) pathTo(world, m, target.pos);
    else m.facing = facingFromVector(target.pos.x - m.pos.x, target.pos.y - m.pos.y, m.facing);
    return;
  }
  const reach = m.radius + target.radius + 4;
  if (d > reach) pathTo(world, m, target.pos);
  else m.facing = facingFromVector(target.pos.x - m.pos.x, target.pos.y - m.pos.y, m.facing);
}
