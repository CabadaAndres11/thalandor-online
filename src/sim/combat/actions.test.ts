import { TILE_SIZE } from '../constants';
import { useAbility } from './actions';
import { addPlayer, input, steps, testWorld } from './test-world';

describe('shapes and targeting', () => {
  test('melee arc hits enemies in front, not behind, not allies', () => {
    const w = testWorld();
    const war = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const ally = addPlayer(w, 'cleric', { x: 330, y: 300 });
    const front = w.addMonster('skeleton', { x: 340, y: 300 });
    const behind = w.addMonster('skeleton', { x: 260, y: 300 });
    expect(useAbility(w, war, 'warrior_slash', { x: 400, y: 300 })).toBe('ok');
    expect(front.hp).toBeLessThan(front.stats.maxHp);
    expect(behind.hp).toBe(behind.stats.maxHp);
    expect(ally.hp).toBe(ally.stats.maxHp);
  });

  test('no friendly fire, heals only allies', () => {
    const w = testWorld();
    const mage = addPlayer(w, 'mage', { x: 300, y: 300 });
    const ally = addPlayer(w, 'warrior', { x: 320, y: 300 });
    const mob = w.addMonster('skeleton', { x: 300, y: 330 });
    useAbility(w, mage, 'mage_frost_nova', { x: 300, y: 300 });
    expect(ally.hp).toBe(ally.stats.maxHp);
    expect(ally.statuses.some((s) => s.kind === 'freeze')).toBe(false);
    expect(mob.statuses.some((s) => s.kind === 'freeze')).toBe(true);

    const cleric = addPlayer(w, 'cleric', { x: 500, y: 300 });
    cleric.hp = 50;
    const mob2 = w.addMonster('skeleton', { x: 560, y: 300 });
    mob2.hp = 10;
    useAbility(w, cleric, 'cleric_heal', { x: 560, y: 300 }); // cursor on an enemy: heals self
    expect(mob2.hp).toBe(10);
    expect(cleric.hp).toBeGreaterThan(50);
  });

  test('ally heal targets the ally under the cursor', () => {
    const w = testWorld();
    const cleric = addPlayer(w, 'cleric', { x: 300, y: 300 });
    const ally = addPlayer(w, 'warrior', { x: 420, y: 300 });
    ally.hp = 40;
    useAbility(w, cleric, 'cleric_heal', { x: 425, y: 305 });
    expect(ally.hp).toBeGreaterThan(40);
    expect(cleric.hp).toBe(cleric.stats.maxHp);
  });

  test('ally heal prefers an ally standing on top of the caster over the caster', () => {
    const w = testWorld();
    const cleric = addPlayer(w, 'cleric', { x: 300, y: 300 });
    const ally = addPlayer(w, 'warrior', { x: 300, y: 300 });
    ally.hp = 40;
    useAbility(w, cleric, 'cleric_heal', { x: 300, y: 300 });
    expect(ally.hp).toBeGreaterThan(40);
  });

  test('holy nova damages enemies and heals allies around', () => {
    const w = testWorld();
    const cleric = addPlayer(w, 'cleric', { x: 300, y: 300 });
    const ally = addPlayer(w, 'warrior', { x: 340, y: 300 });
    ally.hp = 50;
    const mob = w.addMonster('skeleton', { x: 300, y: 350 });
    useAbility(w, cleric, 'cleric_holy_nova', { x: 0, y: 0 });
    expect(ally.hp).toBeGreaterThan(50);
    expect(mob.hp).toBeLessThan(mob.stats.maxHp);
  });

  test('projectile travels and hits the first enemy', () => {
    const w = testWorld();
    const mage = addPlayer(w, 'mage', { x: 100, y: 300 });
    const mob = w.addMonster('skeleton', { x: 300, y: 300 });
    const far = w.addMonster('skeleton', { x: 360, y: 300 });
    useAbility(w, mage, 'mage_arcane_missile', { x: 300, y: 300 });
    expect(mob.hp).toBe(mob.stats.maxHp);
    steps(w, 12);
    expect(mob.hp).toBeLessThan(mob.stats.maxHp);
    expect(far.hp).toBe(far.stats.maxHp);
    expect(w.projectiles).toHaveLength(0);
  });

  test('projectile stops at walls', () => {
    const solid: [number, number][] = [];
    for (let y = 0; y < 20; y++) solid.push([12, y]);
    const w = testWorld({ solid });
    const mage = addPlayer(w, 'mage', { x: 200, y: 300 });
    const behind = w.addMonster('skeleton', { x: 12 * TILE_SIZE + 60, y: 300 });
    useAbility(w, mage, 'mage_arcane_missile', behind.pos);
    steps(w, 20);
    expect(behind.hp).toBe(behind.stats.maxHp);
    expect(w.projectiles).toHaveLength(0);
  });

  test('delayed area emits a telegraph and hits after the delay', () => {
    const w = testWorld();
    const mage = addPlayer(w, 'mage', { x: 300, y: 300 });
    const mob = w.addMonster('skeleton', { x: 450, y: 300 });
    useAbility(w, mage, 'mage_arcane_burst', { x: 450, y: 300 });
    expect(w.drainEvents().some((e) => e.e === 'tele')).toBe(true);
    expect(mob.hp).toBe(mob.stats.maxHp);
    steps(w, 7);
    expect(mob.hp).toBeLessThan(mob.stats.maxHp);
  });
});

describe('movement abilities', () => {
  test('blink stops at last free point before a wall', () => {
    const w = testWorld({ solid: [[12, 9], [12, 10]] });
    const mage = addPlayer(w, 'mage', { x: 300, y: 10 * TILE_SIZE });
    useAbility(w, mage, 'mage_blink', { x: 600, y: 10 * TILE_SIZE });
    expect(mage.pos.x).toBeLessThanOrEqual(12 * TILE_SIZE - mage.radius);
    expect(mage.pos.x).toBeGreaterThan(330);
    expect(w.isSpawnable(mage.pos, mage.radius)).toBe(true);
  });

  test('charge stops at the first enemy and stuns it', () => {
    const w = testWorld();
    const war = addPlayer(w, 'warrior', { x: 200, y: 300 });
    const mob = w.addMonster('skeleton', { x: 330, y: 300 });
    useAbility(w, war, 'warrior_charge', { x: 500, y: 300 });
    steps(w, 8);
    expect(Math.hypot(war.pos.x - mob.pos.x, war.pos.y - mob.pos.y)).toBeLessThan(war.radius + mob.radius + 12);
    expect(war.pos.x).toBeGreaterThan(260);
    expect(mob.statuses.some((s) => s.kind === 'stun')).toBe(true);
    expect(war.resource).toBeGreaterThanOrEqual(15);
  });

  test('charge against a wall never ends inside it', () => {
    const w = testWorld({ solid: [[10, 9]] });
    const war = addPlayer(w, 'warrior', { x: 200, y: 9 * TILE_SIZE + 16 });
    useAbility(w, war, 'warrior_charge', { x: 600, y: 9 * TILE_SIZE + 16 });
    steps(w, 10);
    expect(war.pos.x + war.radius).toBeLessThanOrEqual(10 * TILE_SIZE + 1e-6);
  });

  test('roll moves backwards then fires the follow-up shot', () => {
    const w = testWorld();
    const ex = addPlayer(w, 'explorer', { x: 300, y: 300 });
    useAbility(w, ex, 'explorer_roll', { x: 500, y: 300 });
    steps(w, 6);
    expect(ex.pos.x).toBeLessThan(200);
    expect(w.drainEvents().some((e) => e.e === 'proj')).toBe(true);
  });

  test('dodge press dashes 96px and grants brief invulnerability', () => {
    const w = testWorld();
    const p = addPlayer(w, 'cleric', { x: 300, y: 300 });
    const mob = w.addMonster('skeleton', { x: 330, y: 300 });
    input(w, p, { moveX: 1, presses: [{ seq: 1, slot: 'dodge', aimX: 400, aimY: 300 }] });
    w.step();
    const hpBefore = p.hp;
    useAbility(w, mob, 'skeleton_slash', p.pos);
    expect(p.hp).toBe(hpBefore);
    steps(w, 4);
    expect(p.pos.x).toBeCloseTo(396, 0);
  });
});

describe('costs, cooldowns and control', () => {
  test('resource, cooldown and global cooldown gate abilities', () => {
    const w = testWorld();
    const war = addPlayer(w, 'warrior', { x: 300, y: 300 });
    w.addMonster('skeleton', { x: 340, y: 300 });
    expect(useAbility(w, war, 'warrior_brutal_strike', { x: 400, y: 300 })).toBe('resource');
    war.resource = 100;
    expect(useAbility(w, war, 'warrior_brutal_strike', { x: 400, y: 300 })).toBe('ok');
    expect(war.resource).toBe(70);
    expect(useAbility(w, war, 'warrior_whirlwind', { x: 400, y: 300 })).toBe('gcd');
    expect(useAbility(w, war, 'warrior_slash', { x: 400, y: 300 })).toBe('ok'); // basic attacks ignore the GCD
    steps(w, 10);
    expect(useAbility(w, war, 'warrior_brutal_strike', { x: 400, y: 300 })).toBe('cooldown');
    expect(useAbility(w, war, 'warrior_whirlwind', { x: 400, y: 300 })).toBe('ok');
  });

  test('rage is gained only when the attack hits', () => {
    const w = testWorld();
    const war = addPlayer(w, 'warrior', { x: 300, y: 300 });
    useAbility(w, war, 'warrior_slash', { x: 400, y: 300 });
    expect(war.resource).toBe(0);
    w.addMonster('skeleton', { x: 340, y: 300 });
    steps(w, 20);
    useAbility(w, war, 'warrior_slash', { x: 400, y: 300 });
    expect(war.resource).toBeGreaterThanOrEqual(8);
  });

  test('a stunned unit cannot act or move', () => {
    const w = testWorld();
    const p = addPlayer(w, 'mage', { x: 300, y: 300 });
    p.statuses.push({ kind: 'stun', until: w.now + 2000, sourceId: 0 });
    expect(useAbility(w, p, 'mage_arcane_missile', { x: 400, y: 300 })).toBe('control');
    input(w, p, { moveX: 1 });
    w.step();
    expect(p.pos.x).toBe(300);
  });

  test('shield absorbs before health; heal over time ticks; buff raises damage', () => {
    const w = testWorld();
    const mage = addPlayer(w, 'mage', { x: 300, y: 300 });
    useAbility(w, mage, 'mage_mana_barrier', { x: 0, y: 0 });
    const mob = w.addMonster('orc_elite', { x: 330, y: 300 });
    useAbility(w, mob, 'orc_cleave', mage.pos);
    expect(mage.hp).toBe(mage.stats.maxHp);

    const cleric = addPlayer(w, 'cleric', { x: 600, y: 300 });
    cleric.hp = 40;
    useAbility(w, cleric, 'cleric_renew', { x: 600, y: 300 });
    const afterCast = cleric.hp;
    steps(w, 41);
    expect(cleric.hp).toBeGreaterThan(afterCast);

    const war = addPlayer(w, 'warrior', { x: 300, y: 500 });
    const before = war.stats.damageDone;
    war.resource = 100;
    useAbility(w, war, 'warrior_battle_shout', { x: 0, y: 0 });
    expect(war.stats.damageDone).toBeCloseTo(before * 1.15, 9);
  });
});
