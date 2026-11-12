/** Helpers for combat tests (not used by game code). */
import { defaultAppearance, type ClassId } from '../../appearance/catalog';
import { CollisionMap } from '../collision-map';
import type { PlayerInput, Vec2 } from '../types';
import { World, type WorldOptions } from '../world';
import { ABILITIES, type AbilityDef, type PassiveDef, type StatMod } from './defs';
import { rebuildPlayer, recomputeStats, type Unit } from './unit';

/** An open 30x20-tile map (960x640 px), optionally with solid tiles. rng = 0.5: no crit, no dodge, no variance. */
export function testWorld(opts: { solid?: [number, number][]; world?: WorldOptions } = {}): World {
  const w = 30;
  const h = 20;
  const solid = new Uint8Array(w * h);
  for (const [x, y] of opts.solid ?? []) solid[y * w + x] = 1;
  return new World(new CollisionMap(w, h, solid), { x: 480, y: 320 }, { rng: () => 0.5, spawns: [], ...opts.world });
}

export function addPlayer(world: World, classId: ClassId, at: Vec2, name: string = classId): Unit {
  return world.addPlayer({ name, classId, appearance: defaultAppearance(classId) }, at);
}

/** Sets a player's level directly (unlocks passives and abilities). */
export function setLevel(world: World, u: Unit, level: number): Unit {
  u.level = level;
  rebuildPlayer(u, world.now);
  return u;
}

let seq = 1000;
/** Queues one input tick for a player. */
export function input(world: World, u: Unit, i: Partial<PlayerInput> = {}): void {
  world.queueInput(u.id, { seq: ++seq, moveX: 0, moveY: 0, aimX: u.pos.x + 1, aimY: u.pos.y, buttons: 0, presses: [], ...i });
}

export function steps(world: World, n: number): void {
  for (let i = 0; i < n; i++) world.step();
}

/** Registers a throwaway ability for a test (melee hit of 10 by default). */
export function testAbility(id: string, def: Partial<AbilityDef> = {}): string {
  ABILITIES[id] = {
    id,
    nameKey: id,
    icon: 'sword:#ffffff',
    school: 'physical',
    anim: 'none',
    cost: 0,
    cooldownMs: 0,
    gcd: false,
    range: 600,
    dodgeable: false,
    shape: { type: 'melee_arc', radius: 60, arcDeg: 360 },
    effects: [{ type: 'damage', base: 10, coef: 0 }],
    ...def,
  };
  return id;
}

/** Gives a unit an extra passive and/or permanent stat modifiers. */
export function grant(world: World, u: Unit, extra: { passive?: Omit<PassiveDef, 'id' | 'nameKey'> & { id?: string }; mods?: StatMod[] }): Unit {
  if (extra.passive) u.passives = [...u.passives, { id: 'test', nameKey: 'test', ...extra.passive }];
  if (extra.mods) u.mods = [...u.mods, ...extra.mods];
  recomputeStats(u, world.now);
  return u;
}
