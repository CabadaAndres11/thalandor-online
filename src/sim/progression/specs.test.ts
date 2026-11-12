import texts from '../../../data/i18n/es.json';
import { useAbility } from '../combat/actions';
import { rebuildPlayer } from '../combat/unit';
import { ability, CLASSES, validateDefs } from '../combat/defs';
import { addPlayer, grant, setLevel, testWorld } from '../combat/test-world';
import { applyProgressRequest, devSetLevel, progressInfo } from './requests';
import { loadout, SPECS, specsOf, UNLOCK, unlockedActives } from './unlocks';
import { sanitizeProgress } from './validate';

const T = texts as Record<string, string>;

test('annex A: two specs per class, each with 3 actives and 3 passives, all with texts', () => {
  expect(Object.keys(SPECS)).toHaveLength(8);
  for (const classId of Object.keys(CLASSES)) expect(specsOf(classId)).toHaveLength(2);
  for (const s of Object.values(SPECS)) {
    expect(s.actives).toHaveLength(3);
    expect(s.passives).toHaveLength(3);
    for (const id of [...s.actives, ...Object.values(s.replaces ?? {})]) {
      expect(ability(id), id).toBeDefined();
      expect(T[`desc.${id}`], id).toBeTruthy();
    }
    for (const p of s.passives) {
      expect(T[p.nameKey], p.id).toBeTruthy();
      expect(T[`desc.${p.id}`], p.id).toBeTruthy();
    }
    expect(T[s.nameKey]).toBeTruthy();
    expect(T[s.descKey]).toBeTruthy();
  }
  expect(validateDefs(T)).toEqual([]);
});

test('spec abilities unlock at 10, 16 and 22; spec passives at 10, 20 and 30', () => {
  const s = SPECS.mage_fire!;
  expect(unlockedActives('mage', 'mage_fire', 9)).not.toContain(s.actives[0]);
  expect(unlockedActives('mage', 'mage_fire', 10)).toContain(s.actives[0]);
  expect(unlockedActives('mage', 'mage_fire', 16)).toContain(s.actives[1]);
  expect(unlockedActives('mage', 'mage_fire', 22)).toContain(s.actives[2]);
  const w = testWorld();
  const p = addPlayer(w, 'mage', { x: 300, y: 300 });
  p.specId = 'mage_fire';
  const ids = (l: number) => setLevel(w, p, l).passives.map((x) => x.id);
  expect(ids(10)).toContain('mage_ignition');
  expect(ids(19)).not.toContain('mage_combustion');
  expect(ids(20)).toContain('mage_combustion');
  expect(ids(30)).toContain('mage_phoenix');
  expect(UNLOCK.specPassives).toEqual([10, 20, 30]);
});

test('assassin replaces the left click with Cut; the first spec ability goes to slot 4', () => {
  expect(loadout('explorer', 'explorer_assassin', 10, [null, null, null, null])).toMatchObject({
    lmb: 'explorer_cut',
    rmb: CLASSES.explorer!.slots.rmb,
    s4: 'explorer_eviscerate',
  });
  expect(loadout('explorer', 'explorer_marksman', 10, [null, null, null, null]).lmb).toBe(CLASSES.explorer!.slots.lmb);
});

test('spec change refused in combat, below level 10 or for another class', () => {
  const w = testWorld();
  const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
  expect(applyProgressRequest(w, p, { k: 'spec', specId: 'warrior_arms' })).toBe('level');
  devSetLevel(w, p, 10);
  expect(applyProgressRequest(w, p, { k: 'spec', specId: 'mage_fire' })).toBe('invalid');
  p.inCombatUntil = w.now + 5000;
  expect(applyProgressRequest(w, p, { k: 'spec', specId: 'warrior_arms' })).toBe('combat');
  expect(p.specId).toBeNull();
  p.inCombatUntil = 0;
  expect(applyProgressRequest(w, p, { k: 'spec', specId: 'warrior_arms' })).toBe('ok');
  expect(p.slots.s4).toBe('warrior_mortal_strike');
  expect(w.drainProgress()).toContain(p.id);
});

test('attribute and talent requests spend free points only', () => {
  const w = testWorld();
  const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
  expect(applyProgressRequest(w, p, { k: 'attr', attr: 'stamina' })).toBe('points');
  expect(applyProgressRequest(w, p, { k: 'talent', node: 'bastion_1' })).toBe('points');
  devSetLevel(w, p, 2);
  const hp = p.stats.maxHp;
  for (let i = 0; i < 5; i++) expect(applyProgressRequest(w, p, { k: 'attr', attr: 'stamina' })).toBe('ok');
  expect(applyProgressRequest(w, p, { k: 'attr', attr: 'stamina' })).toBe('points');
  expect(p.stats.maxHp).toBe(hp + 50);
  const armor = p.stats.armor;
  expect(applyProgressRequest(w, p, { k: 'talent', node: 'bastion_1' })).toBe('ok');
  expect(p.stats.armor).toBeCloseTo(armor * 1.04, 6);
  expect(applyProgressRequest(w, p, { k: 'talent', node: 'bastion_1' })).toBe('points');
  const info = progressInfo(p);
  expect(info).toMatchObject({ level: 2, freeAttrPoints: 0, freeTalentPoints: 0, talents: { bastion_1: 1 } });
});

test('resets are free out of combat and refused in combat', () => {
  const w = testWorld();
  const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
  devSetLevel(w, p, 5);
  applyProgressRequest(w, p, { k: 'attr', attr: 'strength' });
  applyProgressRequest(w, p, { k: 'talent', node: 'might_1' });
  p.inCombatUntil = w.now + 5000;
  expect(applyProgressRequest(w, p, { k: 'resetTalents' })).toBe('combat');
  p.inCombatUntil = 0;
  expect(applyProgressRequest(w, p, { k: 'resetTalents' })).toBe('ok');
  expect(applyProgressRequest(w, p, { k: 'resetAttrs' })).toBe('ok');
  expect(progressInfo(p)).toMatchObject({ freeAttrPoints: 20, freeTalentPoints: 4 });
});

test('hotbar: only unlocked actives; moving one that is already placed swaps', () => {
  const w = testWorld();
  const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
  devSetLevel(w, p, 6);
  const s = CLASSES.warrior!.slots;
  expect(applyProgressRequest(w, p, { k: 'hotbar', slot: 0, abilityId: 'mage_blink' })).toBe('invalid');
  expect(applyProgressRequest(w, p, { k: 'hotbar', slot: 5, abilityId: s.s1 })).toBe('invalid');
  expect(applyProgressRequest(w, p, { k: 'hotbar', slot: 0, abilityId: s.s3 })).toBe('ok');
  expect([p.slots.s1, p.slots.s2, p.slots.s3]).toEqual([s.s3, s.s2, s.s1]);
  expect(applyProgressRequest(w, p, { k: 'hotbar', slot: 3, abilityId: s.s2 })).toBe('ok');
  expect(p.slots.s4).toBe(s.s2);
  expect(p.slots.s2).toBeNull();
});

test('dev level keeps valid choices and drops impossible ones', () => {
  const w = testWorld();
  const p = grant(w, addPlayer(w, 'cleric', { x: 300, y: 300 }), {});
  devSetLevel(w, p, 12);
  applyProgressRequest(w, p, { k: 'spec', specId: 'cleric_holy' });
  for (let i = 0; i < 3; i++) applyProgressRequest(w, p, { k: 'talent', node: ['vitality_1', 'vitality_2', 'vitality_3'][i]! });
  devSetLevel(w, p, 3);
  expect(p.specId).toBeNull();
  expect(p.talents).toEqual({});
  expect(p.hp).toBe(p.stats.maxHp);
});

test('prototype keys never count as talents, specs or attributes', () => {
  const w = testWorld();
  const p = addPlayer(w, 'warrior', { x: 300, y: 300 });
  devSetLevel(w, p, 30);
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    expect(applyProgressRequest(w, p, { k: 'talent', node: key })).not.toBe('ok');
    expect(applyProgressRequest(w, p, { k: 'spec', specId: key })).not.toBe('ok');
    expect(applyProgressRequest(w, p, { k: 'attr', attr: key as 'strength' })).not.toBe('ok');
    expect(applyProgressRequest(w, p, { k: 'hotbar', slot: 0, abilityId: key })).not.toBe('ok');
  }
  expect(sanitizeProgress('warrior', JSON.parse('{"level":30,"talents":{"__proto__":1,"constructor":1},"specId":"constructor"}')).resets).toEqual(['talents', 'spec']);
});

test('vanishing does not unlock spec changes or resets mid-fight', () => {
  const w = testWorld();
  const p = addPlayer(w, 'explorer', { x: 300, y: 300 });
  devSetLevel(w, p, 16);
  const m = w.addMonster('skeleton', { x: 330, y: 300 });
  w.damage(m, 1, p, 'physical');
  p.specId = 'explorer_assassin';
  rebuildPlayer(p, w.now);
  useAbility(w, p, 'explorer_stealth', p.pos);
  expect(p.inCombatUntil).toBe(0);
  expect(applyProgressRequest(w, p, { k: 'resetTalents' })).toBe('combat');
  expect(applyProgressRequest(w, p, { k: 'spec', specId: 'explorer_marksman' })).toBe('combat');
});
