import es from '../../../data/i18n/es.json';
import { ABILITIES, ability, CLASSES, MONSTERS, validateDefs } from './defs';

test('all ability, class and monster data is consistent (effects, icons, texts, references)', () => {
  expect(validateDefs(es as Record<string, string>)).toEqual([]);
});

test('every class fills lmb, rmb and s1-s3 with existing abilities', () => {
  for (const c of Object.values(CLASSES)) {
    for (const slot of ['lmb', 'rmb', 's1', 's2', 's3'] as const) expect(ability(c.slots[slot]!)).toBeDefined();
    expect(c.passives).toHaveLength(2);
  }
});

test('ids are attached and lookups are safe', () => {
  expect(ABILITIES.warrior_slash!.id).toBe('warrior_slash');
  expect(MONSTERS.skeleton!.id).toBe('skeleton');
  expect(ability('constructor')).toBeUndefined();
  expect(ability('nope')).toBeUndefined();
});

test('validateDefs reports a missing text', () => {
  expect(validateDefs({}).length).toBeGreaterThan(0);
});
