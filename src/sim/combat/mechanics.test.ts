import { TICK_RATE as TPS } from '../constants';
import { effectiveCooldown, useAbility } from './actions';
import { ability } from './defs';
import { addPlayer, grant, input, setLevel, steps, testAbility, testWorld } from './test-world';
import { hasStatus } from './unit';

const ARC = { school: 'arcane' as const };
const hit = (base = 10) => testAbility(`hit${base}`, { ...ARC, effects: [{ type: 'damage', base, coef: 0 }] });

describe('new stats', () => {
  test('critDamage adds to the critical multiplier', () => {
    const w = testWorld();
    const p = grant(w, addPlayer(w, 'mage', { x: 300, y: 300 }), { mods: [{ stat: 'critChance', flat: 1 }, { stat: 'critDamage', flat: 0.5 }] });
    const m = w.addMonster('skeleton', { x: 330, y: 300 });
    useAbility(w, p, hit(), m.pos);
    expect(m.stats.maxHp - m.hp).toBe(20); // 10 * (1.5 + 0.5)
  });

  test('cooldown reduction is capped at 40%', () => {
    const w = testWorld();
    const p = grant(w, addPlayer(w, 'mage', { x: 300, y: 300 }), { mods: [{ stat: 'cooldownReduction', flat: 0.9 }] });
    expect(effectiveCooldown(w, p, ability(testAbility('cd', { cooldownMs: 10_000 }))!)).toBe(6000);
  });

  test('lifesteal heals the attacker by a share of damage done', () => {
    const w = testWorld();
    const p = grant(w, addPlayer(w, 'mage', { x: 300, y: 300 }), { mods: [{ stat: 'lifesteal', flat: 0.5 }] });
    p.hp = 50;
    const m = w.addMonster('skeleton', { x: 330, y: 300 });
    useAbility(w, p, hit(), m.pos);
    expect(p.hp).toBe(55);
  });

  test('block halves melee physical hits only', () => {
    const w = testWorld();
    const p = grant(w, addPlayer(w, 'warrior', { x: 300, y: 300 }), { mods: [{ stat: 'blockChance', flat: 1 }, { stat: 'armor', pct: -1 }] });
    const m = w.addMonster('skeleton', { x: 330, y: 300 });
    const melee = testAbility('melee100', { effects: [{ type: 'damage', base: 100, coef: 0 }] });
    useAbility(w, m, melee, p.pos);
    expect(p.stats.maxHp - p.hp).toBe(50);
    const events = w.drainEvents();
    expect(events).toContainEqual(expect.objectContaining({ e: 'hit', dst: p.id, blocked: true }));
    const before = p.hp;
    useAbility(w, m, testAbility('spell100', { ...ARC, effects: [{ type: 'damage', base: 100, coef: 0 }] }), p.pos);
    expect(before - p.hp).toBe(100);
  });

  test('threat multiplier scales threat', () => {
    const w = testWorld();
    const a = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const b = grant(w, addPlayer(w, 'warrior', { x: 300, y: 340 }), { mods: [{ stat: 'threatMultiplier', pct: 1 }] });
    const m = w.addMonster('skeleton', { x: 330, y: 320 });
    w.addThreat(m, a, 10);
    w.addThreat(m, b, 10);
    expect(m.ai!.threat.get(a.id)).toBe(10);
    expect(m.ai!.threat.get(b.id)).toBe(20);
  });

  test('flat buffs add to a stat (e.g. +30% crit chance)', () => {
    const w = testWorld();
    const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const base = p.stats.critChance;
    useAbility(w, p, testAbility('reck', { shape: { type: 'self' }, effects: [{ type: 'buff', stat: 'critChance', flat: 0.3, durationMs: 1000 }] }), p.pos);
    expect(p.stats.critChance).toBeCloseTo(base + 0.3, 9);
  });
});

describe('damage conditions', () => {
  test('from behind, far, execute and versus status', () => {
    const w = testWorld();
    const p = addPlayer(w, 'explorer', { x: 300, y: 300 });
    const m = w.addMonster('skeleton', { x: 330, y: 300 });
    const id = testAbility('cond', {
      ...ARC,
      shape: { type: 'melee_arc', radius: 400, arcDeg: 360 },
      effects: [
        {
          type: 'damage',
          base: 100,
          coef: 0,
          bonuses: [{ pct: 0.2, fromBehind: true }, { pct: 0.15, far: true }, { pct: 1, belowHpPct: 0.25 }, { pct: 0.3, vsStatus: ['slow', 'freeze'] }],
        },
      ],
    });
    m.facing = 3; // RIGHT: looking away from the player on its left
    m.hp = m.stats.maxHp = 10_000;
    useAbility(w, p, id, m.pos);
    expect(10_000 - m.hp).toBe(120);
    m.facing = 1; // LEFT: facing the player
    m.hp = 10_000;
    m.statuses.push({ kind: 'slow', until: w.now + 1000, sourceId: p.id, pct: 0.1 });
    useAbility(w, p, id, m.pos);
    expect(10_000 - m.hp).toBe(130);
    m.statuses = [];
    m.pos = { x: 600, y: 300 };
    m.hp = 2000; // below 25%
    useAbility(w, p, id, m.pos);
    expect(2000 - m.hp).toBe(215);
  });

  test('passive damage bonuses by school', () => {
    const w = testWorld();
    const p = grant(w, addPlayer(w, 'mage', { x: 300, y: 300 }), { passive: { damageBonuses: [{ pct: 0.5, school: 'arcane' }] } });
    const m = w.addMonster('skeleton', { x: 330, y: 300 });
    useAbility(w, p, hit(), m.pos);
    expect(m.stats.maxHp - m.hp).toBe(15);
  });
});

describe('passive triggers', () => {
  test('onCrit heals; onKill resets a cooldown', () => {
    const w = testWorld();
    const p = grant(w, addPlayer(w, 'warrior', { x: 300, y: 300 }), {
      mods: [{ stat: 'critChance', flat: 1 }],
      passive: { onCrit: { healPctMaxHp: 0.1 }, onKill: { resetCooldown: 'warrior_charge' } },
    });
    p.hp = 10;
    p.cooldowns.warrior_charge = w.now + 99_999;
    const m = w.addMonster('skeleton', { x: 330, y: 300 });
    m.hp = 5;
    useAbility(w, p, hit(), m.pos);
    expect(p.hp).toBe(10 + Math.round(p.stats.maxHp * 0.1));
    expect(p.cooldowns.warrior_charge).toBeUndefined();
  });

  test('onDodge gives extra combo to the next generator', () => {
    const w = testWorld();
    const p = grant(w, addPlayer(w, 'explorer', { x: 300, y: 300 }), { mods: [{ stat: 'dodgeChance', flat: 1 }], passive: { onDodge: { nextComboBonus: 2 } } });
    const m = w.addMonster('skeleton', { x: 330, y: 300 });
    useAbility(w, m, testAbility('dodgeable', { dodgeable: true }), p.pos);
    useAbility(w, p, testAbility('gen', { ...ARC, comboGain: 1 }), m.pos);
    expect(p.combo).toBe(3);
  });

  test('onLowHp casts its ability once per cooldown', () => {
    const w = testWorld();
    const stand = testAbility('stand', { shape: { type: 'self' }, effects: [{ type: 'buff', stat: 'damageTaken', pct: -0.4, durationMs: 8000, to: 'self' }] });
    const p = grant(w, addPlayer(w, 'warrior', { x: 300, y: 300 }), { passive: { id: 'last', onLowHp: { belowPct: 0.2, cooldownMs: 120_000, abilityId: stand } } });
    w.damage(p, p.stats.maxHp * 0.85, null, 'arcane');
    expect(p.stats.damageTaken).toBeCloseTo(0.6, 9);
    expect(w.drainEvents()).toContainEqual({ e: 'proc', id: p.id, passiveId: 'last' });
    expect(p.procCd.last).toBe(w.now + 120_000);
  });

  test('cheat death: own phoenix, then a guardian ally', () => {
    const w = testWorld();
    const mage = grant(w, addPlayer(w, 'mage', { x: 300, y: 300 }), { passive: { id: 'phoenix', cheatDeath: { cooldownMs: 300_000, hpPct: 0.3 } } });
    grant(w, addPlayer(w, 'cleric', { x: 360, y: 300 }), { passive: { id: 'angel', cheatDeath: { cooldownMs: 180_000, hpPct: 0.1, allies: true } } });
    w.damage(mage, 99_999, null, 'arcane');
    expect(mage.state).toBe('alive');
    expect(mage.hp).toBe(Math.round(mage.stats.maxHp * 0.3));
    w.damage(mage, 99_999, null, 'arcane');
    expect(mage.state).toBe('alive');
    expect(mage.hp).toBe(Math.round(mage.stats.maxHp * 0.1));
    w.damage(mage, 99_999, null, 'arcane');
    expect(mage.state).toBe('downed');
  });

  test('every 5th basic attack is a guaranteed crit', () => {
    const w = testWorld();
    const p = grant(w, addPlayer(w, 'explorer', { x: 300, y: 300 }), { passive: { everyNthBasic: { n: 5 } } });
    p.slots.lmb = hit();
    const m = w.addMonster('skeleton', { x: 330, y: 300 });
    m.hp = m.stats.maxHp = 10_000;
    for (let i = 0; i < 4; i++) useAbility(w, p, p.slots.lmb, m.pos);
    expect(10_000 - m.hp).toBe(40);
    useAbility(w, p, p.slots.lmb, m.pos);
    expect(10_000 - m.hp).toBe(55);
  });

  test('heal echo leaves a heal over time; atonement heals the most wounded ally', () => {
    const w = testWorld();
    const c = grant(w, addPlayer(w, 'cleric', { x: 300, y: 300 }), { passive: { healEcho: { pct: 0.2, durationMs: 4000, tickMs: 1000 }, atonement: { pct: 0.3, range: 400 } } });
    const ally = addPlayer(w, 'warrior', { x: 340, y: 300 });
    ally.hp = 10;
    useAbility(w, c, testAbility('h', { ...ARC, shape: { type: 'ally_target' }, effects: [{ type: 'heal', base: 100, coef: 0 }] }), ally.pos);
    expect(ally.statuses.some((s) => s.kind === 'hot' && s.amount === 5)).toBe(true);
    const hurt = ally.hp - 50;
    ally.hp = hurt;
    const m = w.addMonster('skeleton', { x: 300, y: 330 });
    useAbility(w, c, testAbility('h100', { ...ARC, effects: [{ type: 'damage', base: 100, coef: 0 }] }), m.pos);
    expect(ally.hp).toBe(hurt + 30);
  });
});

describe('new shapes', () => {
  test('exploding projectile hits everything around the impact', () => {
    const w = testWorld();
    const p = addPlayer(w, 'mage', { x: 200, y: 300 });
    const a = w.addMonster('skeleton', { x: 400, y: 300 });
    const b = w.addMonster('skeleton', { x: 420, y: 340 });
    useAbility(w, p, testAbility('fb', { ...ARC, shape: { type: 'projectile', speed: 600, radius: 6, pierce: false, look: 'fire', explodeRadius: 60 } }), a.pos);
    steps(w, TPS);
    expect(a.hp).toBeLessThan(a.stats.maxHp);
    expect(b.hp).toBeLessThan(b.stats.maxHp);
  });

  test('piercing projectile hits every enemy in line once; count fans out', () => {
    const w = testWorld();
    const p = addPlayer(w, 'cleric', { x: 100, y: 300 });
    const ms = [250, 350, 450].map((x) => w.addMonster('skeleton', { x, y: 300 }));
    useAbility(w, p, testAbility('lance', { ...ARC, shape: { type: 'projectile', speed: 600, radius: 6, pierce: true, look: 'holy' } }), { x: 900, y: 300 });
    steps(w, TPS * 2);
    for (const m of ms) expect(m.stats.maxHp - m.hp).toBe(10);
    useAbility(w, p, testAbility('multi', { ...ARC, shape: { type: 'projectile', speed: 600, radius: 6, pierce: false, look: 'arrow', count: 5, spreadDeg: 40 } }), { x: 900, y: 300 });
    expect(w.projectiles).toHaveLength(5);
  });

  test('zones tick their effects for their duration', () => {
    const w = testWorld();
    const p = addPlayer(w, 'mage', { x: 200, y: 300 });
    const m = w.addMonster('skeleton', { x: 400, y: 300 });
    m.statuses.push({ kind: 'root', until: 1e9, sourceId: p.id }); // keep it inside
    useAbility(w, p, testAbility('bliz', { ...ARC, shape: { type: 'zone', radius: 80, durationMs: 2000, tickMs: 500 } }), m.pos);
    steps(w, TPS * 3);
    expect(m.stats.maxHp - m.hp).toBe(40);
    expect(w.zones).toHaveLength(0);
  });

  test('revive at range raises a downed ally', () => {
    const w = testWorld();
    const c = addPlayer(w, 'cleric', { x: 200, y: 300 });
    const ally = addPlayer(w, 'warrior', { x: 400, y: 300 });
    w.damage(ally, 99_999, null, 'arcane');
    expect(ally.state).toBe('downed');
    useAbility(w, c, testAbility('prayer', { ...ARC, shape: { type: 'revive' }, effects: [{ type: 'revive', hpPct: 0.5 }] }), ally.pos);
    expect(ally.state).toBe('alive');
    expect(ally.hp).toBe(Math.round(ally.stats.maxHp * 0.5));
  });

  test('channel: caster stands still, resolves at the end; a stun cancels it', () => {
    const w = testWorld();
    const p = addPlayer(w, 'explorer', { x: 200, y: 300 });
    const m = w.addMonster('skeleton', { x: 240, y: 300 });
    m.ai!.state = 'combat';
    const aimed = testAbility('aimed', { ...ARC, channelMs: 1000 });
    useAbility(w, p, aimed, m.pos);
    input(w, p, { moveX: 1 });
    steps(w, 1);
    expect(p.pos.x).toBe(200);
    expect(m.hp).toBe(m.stats.maxHp);
    steps(w, TPS);
    expect(m.stats.maxHp - m.hp).toBe(10);
    useAbility(w, p, aimed, m.pos);
    p.statuses.push({ kind: 'stun', until: w.now + 2000, sourceId: m.id });
    steps(w, TPS * 2);
    expect(p.channel).toBeNull();
    expect(m.stats.maxHp - m.hp).toBe(10);
  });

  test('ticking channel resolves every tick', () => {
    const w = testWorld();
    const p = addPlayer(w, 'cleric', { x: 200, y: 300 });
    const m = w.addMonster('skeleton', { x: 240, y: 300 });
    m.ai!.state = 'combat';
    useAbility(w, p, testAbility('hymn', { ...ARC, channelMs: 2000, channelTickMs: 500 }), m.pos);
    steps(w, TPS * 3);
    expect(m.stats.maxHp - m.hp).toBe(40);
  });
});

describe('assassin and tank', () => {
  test('combo points: generator gives 1 (max 5), finisher spends and scales', () => {
    const w = testWorld();
    const p = addPlayer(w, 'explorer', { x: 300, y: 300 });
    const m = w.addMonster('skeleton', { x: 330, y: 300 });
    m.hp = m.stats.maxHp = 10_000;
    const gen = testAbility('slashc', { ...ARC, comboGain: 1 });
    const evis = testAbility('evis', { ...ARC, comboSpend: true, effects: [{ type: 'damage', base: 100, coef: 0, perComboPct: 0.5 }] });
    expect(useAbility(w, p, evis, m.pos)).toBe('combo');
    for (let i = 0; i < 7; i++) useAbility(w, p, gen, m.pos);
    expect(p.combo).toBe(5);
    const before = m.hp;
    useAbility(w, p, evis, m.pos);
    expect(before - m.hp).toBe(350);
    expect(p.combo).toBe(0);
  });

  test('stealth breaks on damage and attack', () => {
    const w = testWorld();
    const p = grant(w, addPlayer(w, 'explorer', { x: 300, y: 300 }), { passive: { ambush: { bonusPct: 0.5 } } });
    const stealth = testAbility('stealth', { shape: { type: 'self' }, cooldownMs: 1000, effects: [{ type: 'stealth', durationMs: 30_000, to: 'self' }] });
    useAbility(w, p, stealth, p.pos);
    expect(hasStatus(p, 'stealth', w.now)).toBe(true);
    // monsters do not notice a stealthed player standing next to them
    const m = w.addMonster('skeleton', { x: 340, y: 300 });
    m.hp = m.stats.maxHp = 10_000;
    steps(w, 10);
    expect(m.ai!.state).not.toBe('combat');
    // the first hit out of stealth is a sure crit with +50%
    useAbility(w, p, hit(), m.pos);
    expect(hasStatus(p, 'stealth', w.now)).toBe(false);
    expect(10_000 - m.hp).toBe(Math.round(10 * 1.5 * 1.5));
    // damage breaks it too
    p.cooldowns = {};
    useAbility(w, p, stealth, p.pos);
    w.damage(p, 1, m, 'arcane');
    expect(hasStatus(p, 'stealth', w.now)).toBe(false);
    // a dead player keeps no stealth
    p.cooldowns = {};
    useAbility(w, p, stealth, p.pos);
    w.damage(p, 99_999, null, 'arcane');
    expect(p.statuses).toEqual([]);
  });

  test('vanish in combat drops threat and leaves combat', () => {
    const w = testWorld();
    const p = addPlayer(w, 'explorer', { x: 300, y: 300 });
    const m = w.addMonster('skeleton', { x: 340, y: 300 });
    w.damage(m, 1, p, 'arcane');
    expect(m.ai!.threat.has(p.id)).toBe(true);
    useAbility(w, p, testAbility('vanish', { shape: { type: 'self' }, effects: [{ type: 'stealth', durationMs: 10_000, to: 'self' }] }), p.pos);
    expect(m.ai!.threat.has(p.id)).toBe(false);
    expect(p.inCombatUntil).toBe(0);
  });

  test('poison imbue stacks up to 5', () => {
    const w = testWorld();
    const p = addPlayer(w, 'explorer', { x: 300, y: 300 });
    const proc = testAbility('poison', { school: 'nature', effects: [{ type: 'dot', base: 4, coef: 0, tickMs: 1000, durationMs: 6000, stackMax: 5 }] });
    useAbility(w, p, testAbility('imbue', { shape: { type: 'self' }, effects: [{ type: 'imbue', abilityId: proc, durationMs: 30_000, to: 'self' }] }), p.pos);
    const m = w.addMonster('skeleton', { x: 330, y: 300 });
    m.hp = m.stats.maxHp = 10_000;
    for (let i = 0; i < 7; i++) useAbility(w, p, hit(), m.pos);
    const dots = m.statuses.filter((s) => s.kind === 'dot');
    expect(dots).toHaveLength(1);
    expect(dots[0]!.stacks).toBe(5);
    expect(dots[0]!.amount).toBe(20);
  });

  test('reflect returns damage to the attacker, never back and forth', () => {
    const w = testWorld();
    const tank = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const m = w.addMonster('skeleton', { x: 330, y: 300 });
    const refl = testAbility('refl', { shape: { type: 'self' }, effects: [{ type: 'reflect', pct: 0.5, durationMs: 5000, to: 'self' }] });
    useAbility(w, tank, refl, tank.pos);
    m.statuses.push({ kind: 'reflect', until: w.now + 5000, sourceId: m.id, pct: 0.5 });
    w.damage(tank, 40, m, 'arcane');
    expect(m.stats.maxHp - m.hp).toBe(20);
    expect(tank.stats.maxHp - tank.hp).toBe(40);
  });

  test('area taunt makes every nearby monster attack the tank', () => {
    const w = testWorld();
    const tank = addPlayer(w, 'warrior', { x: 300, y: 300 });
    const dps = addPlayer(w, 'mage', { x: 500, y: 300 });
    const ms = [w.addMonster('skeleton', { x: 340, y: 300 }), w.addMonster('skeleton', { x: 300, y: 350 })];
    for (const m of ms) w.addThreat(m, dps, 1000);
    useAbility(w, tank, testAbility('taunt', { shape: { type: 'area_self', radius: 150 }, effects: [{ type: 'taunt', durationMs: 4000 }] }), tank.pos);
    for (const m of ms) expect(w.topTarget(m)).toBe(tank);
  });

  test('passives from level unlocks are active (setLevel)', () => {
    const w = testWorld();
    const p = setLevel(w, addPlayer(w, 'explorer', { x: 300, y: 300 }), 15);
    expect(p.passives).toHaveLength(2);
  });
});

test('chill lengthens a slowed unit cooldowns; freezing shortens a cooldown', () => {
  const w = testWorld();
  const mage = grant(w, addPlayer(w, 'mage', { x: 300, y: 300 }), { passive: { chill: { attackSlowPct: 0.15 }, onFreeze: { cdReduce: { abilityId: 'mage_frost_nova', ms: 2000 } } } });
  const m = w.addMonster('skeleton', { x: 330, y: 300 });
  useAbility(w, mage, testAbility('frostbolt', { ...ARC, effects: [{ type: 'slow', pct: 0.5, durationMs: 4000 }] }), m.pos);
  expect(effectiveCooldown(w, m, ability(testAbility('mcd', { cooldownMs: 1000 }))!)).toBeCloseTo(1150, 6);
  mage.cooldowns.mage_frost_nova = w.now + 10_000;
  useAbility(w, mage, testAbility('freezer', { ...ARC, effects: [{ type: 'freeze', durationMs: 1000 }] }), m.pos);
  expect(mage.cooldowns.mage_frost_nova).toBe(w.now + 8000);
});

test('projectiles hit the drawn body, not only the feet', () => {
  const w = testWorld();
  const p = addPlayer(w, 'explorer', { x: 200, y: 300 });
  const m = w.addMonster('skeleton', { x: 400, y: 300 });
  m.statuses.push({ kind: 'root', until: 1e9, sourceId: p.id });
  // Aim at the chest of the sprite (30 px above the feet): the arrow flies above the feet circle.
  p.pos = { x: 200, y: 270 };
  useAbility(w, p, testAbility('shot', { ...ARC, shape: { type: 'projectile', speed: 600, radius: 3, pierce: false, look: 'arrow' } }), { x: 400, y: 270 });
  steps(w, TPS);
  expect(m.stats.maxHp - m.hp).toBe(10);
  // Well above the head it still misses.
  const before = m.hp;
  p.pos = { x: 200, y: 220 };
  useAbility(w, p, 'shot', { x: 400, y: 220 });
  steps(w, TPS);
  expect(m.hp).toBe(before);
});
