import { BALANCE } from './defs';
import { BUTTON } from './unit';
import { useAbility } from './actions';
import { addPlayer, input, steps, testWorld } from './test-world';

const TPS = 20;

describe('death, downed and revive', () => {
  test('solo: dies and respawns at the spawn point after 3 s with full health', () => {
    const w = testWorld();
    const p = addPlayer(w, 'mage', { x: 200, y: 200 });
    w.damage(p, 9999, null, 'physical');
    expect(p.state).toBe('dead');
    steps(w, 3 * TPS + 1);
    expect(p.state).toBe('alive');
    expect(p.pos).toEqual(w.spawn);
    expect(p.hp).toBe(p.stats.maxHp);
    expect(p.resource).toBe(p.stats.maxResource);
  });

  test('group: downed for 30 s, an ally holding E for 3 s revives at 30%', () => {
    const w = testWorld();
    const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const b = addPlayer(w, 'cleric', { x: 330, y: 300 });
    w.damage(a, 9999, null, 'physical');
    expect(a.state).toBe('downed');
    for (let i = 0; i < 3 * TPS + 1; i++) {
      input(w, b, { buttons: BUTTON.interact });
      w.step();
    }
    expect(a.state).toBe('alive');
    expect(a.hp).toBe(Math.round(a.stats.maxHp * BALANCE.death.reviveHpPct));
    expect(w.drainEvents().some((e) => e.e === 'revived' && e.id === a.id)).toBe(true);
  });

  test('revive channel is interrupted by moving', () => {
    const w = testWorld();
    const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const b = addPlayer(w, 'cleric', { x: 330, y: 300 });
    w.damage(a, 9999, null, 'physical');
    for (let i = 0; i < 2 * TPS; i++) {
      input(w, b, { buttons: BUTTON.interact });
      w.step();
    }
    input(w, b, { buttons: BUTTON.interact, moveY: 1 });
    w.step();
    for (let i = 0; i < 1.5 * TPS; i++) {
      input(w, b, { buttons: BUTTON.interact });
      w.step();
    }
    expect(a.state).toBe('downed');
  });

  test('downed player dies after 30 s and respawns', () => {
    const w = testWorld();
    const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
    addPlayer(w, 'cleric', { x: 600, y: 300 });
    w.damage(a, 9999, null, 'physical');
    steps(w, 30 * TPS + 3 * TPS + 2);
    expect(a.state).toBe('alive');
    expect(a.pos).toEqual(w.spawn);
  });

  test('when every player is down, they all respawn', () => {
    const w = testWorld();
    const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const b = addPlayer(w, 'cleric', { x: 600, y: 300 });
    w.damage(a, 9999, null, 'physical');
    w.damage(b, 9999, null, 'physical');
    expect([a.state, b.state]).toEqual(['dead', 'dead']);
    steps(w, 3 * TPS + 1);
    expect([a.state, b.state]).toEqual(['alive', 'alive']);
  });

  test('monsters drop a dead or downed player from their threat', () => {
    const w = testWorld();
    const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const mob = w.addMonster('skeleton', { x: 340, y: 300 });
    w.damage(mob, 5, a, 'physical');
    expect(mob.ai!.threat.has(a.id)).toBe(true);
    w.damage(a, 9999, mob, 'physical');
    expect(mob.ai!.threat.has(a.id)).toBe(false);
  });
});

describe('resources and regeneration', () => {
  test('energy regenerates 10 per second', () => {
    const w = testWorld();
    const p = addPlayer(w, 'explorer', { x: 300, y: 300 });
    p.resource = 0;
    steps(w, TPS);
    expect(p.resource).toBeCloseTo(10, 5);
  });

  test('rage decays out of combat after the delay, slower with Contained Fury', () => {
    const w = testWorld();
    const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
    p.resource = 50;
    steps(w, 3 * TPS);
    expect(p.resource).toBeCloseTo(50, 5);
    steps(w, 2 * TPS);
    expect(p.resource).toBeCloseTo(50 - 2 * 5 * 0.5, 5);
  });

  test('taking damage builds rage', () => {
    const w = testWorld();
    const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
    w.damage(p, 24, null, 'physical');
    expect(p.resource).toBeGreaterThan(0);
  });

  test('mana: full regen out of combat, none in combat without Meditation, half with it', () => {
    const w = testWorld();
    const mage = addPlayer(w, 'mage', { x: 300, y: 300 });
    const cleric = addPlayer(w, 'cleric', { x: 400, y: 300 });
    mage.resource = 0;
    steps(w, TPS);
    const oocRegen = mage.resource;
    expect(oocRegen).toBeGreaterThan(0);
    mage.resource = 0;
    cleric.resource = 0;
    mage.inCombatUntil = cleric.inCombatUntil = w.now + 60_000;
    steps(w, TPS);
    expect(mage.resource).toBe(0);
    expect(cleric.resource).toBeCloseTo(cleric.stats.manaRegen * 0.5, 5);
  });

  test('out of combat health regenerates 2% per second', () => {
    const w = testWorld();
    const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
    p.hp = 100;
    steps(w, TPS);
    expect(p.hp).toBeGreaterThanOrEqual(100 + p.stats.maxHp * 0.02 - 0.01);
  });

  test('frost nova slows nothing friendly and dot from an ability does not exist on allies', () => {
    const w = testWorld();
    const mage = addPlayer(w, 'mage', { x: 300, y: 300 });
    expect(useAbility(w, mage, 'mage_frost_nova', mage.pos)).toBe('ok');
    expect(mage.statuses.filter((s) => s.kind === 'freeze')).toHaveLength(0);
  });
});
