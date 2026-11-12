import { defaultAppearance } from '../appearance/catalog';
import { createCharacter, CURRENT_SCHEMA, emptyProgress, parseCharacter, validateName } from './character';

const app = defaultAppearance('mage');

describe('validateName', () => {
  test('trims and accepts accents, digits, apostrophe and hyphen', () => {
    expect(validateName("  Ñandú d'Or-2 ", [])).toEqual({ ok: true, name: "Ñandú d'Or-2" });
  });

  test('rejects names with markup, emoji or only spaces', () => {
    expect(validateName('<b>x</b>', [])).toEqual({ ok: false, error: 'name.invalidChars' });
    expect(validateName('Ana😀', [])).toEqual({ ok: false, error: 'name.invalidChars' });
    expect(validateName('   ', [])).toEqual({ ok: false, error: 'name.tooShort' });
  });

  test('rejects 1 and 17 chars', () => {
    expect(validateName('A', [])).toEqual({ ok: false, error: 'name.tooShort' });
    expect(validateName('A'.repeat(17), [])).toEqual({ ok: false, error: 'name.tooLong' });
    expect(validateName('A'.repeat(16), [])).toEqual({ ok: true, name: 'A'.repeat(16) });
  });

  test('rejects duplicate case-insensitively', () => {
    expect(validateName('ana', ['Ana', 'Beto'])).toEqual({ ok: false, error: 'name.duplicate' });
  });
});

test('createCharacter sets level 1, xp 0, null location, empty progress, schemaVersion 2', () => {
  const c = createCharacter({ name: 'Ana', classId: 'mage', appearance: app }, 1000, 'id-1');
  expect(c).toEqual({
    schemaVersion: 2,
    id: 'id-1',
    name: 'Ana',
    classId: 'mage',
    appearance: app,
    level: 1,
    xp: 0,
    ...emptyProgress(),
    lastLocation: null,
    createdAt: 1000,
    updatedAt: 1000,
  });
  expect(CURRENT_SCHEMA).toBe(2);
});

describe('parseCharacter', () => {
  const valid = createCharacter({ name: 'Ana', classId: 'cleric', appearance: app }, 5, 'id-2');

  test('round-trips a created character', () => {
    expect(parseCharacter(JSON.parse(JSON.stringify(valid)))).toEqual({ ok: true, character: valid });
  });

  test('keeps a valid lastLocation', () => {
    const c = { ...valid, lastLocation: { mapId: 'test-arena', x: 10, y: 20 } };
    expect(parseCharacter(c)).toEqual({ ok: true, character: c });
  });

  test('replaces unknown appearance with class default', () => {
    const r = parseCharacter({ ...valid, appearance: { body: 'dragon', skin: 'x', hairStyle: 'y', hairColor: 'z' } });
    expect(r).toEqual({ ok: true, character: { ...valid, appearance: defaultAppearance('cleric') } });
  });

  test('rejects missing fields, wrong classId, non-object', () => {
    const { name: _n, ...noName } = valid;
    for (const raw of [null, 'x', 42, [], noName, { ...valid, classId: 'bard' }, { ...valid, level: 'one' }, { ...valid, name: '<b>' }, { ...valid, lastLocation: { x: 1 } }]) {
      expect(parseCharacter(raw)).toEqual({ ok: false, error: 'import.invalid' });
    }
  });

  test('rejects future schemaVersion', () => {
    expect(parseCharacter({ ...valid, schemaVersion: 3 })).toEqual({ ok: false, error: 'import.future' });
  });

  test('migrations run in order', () => {
    const migrations = {
      0: (c: Record<string, unknown>) => ({ ...c, schemaVersion: 1, xp: 0 }),
      1: (c: Record<string, unknown>) => ({ ...c, schemaVersion: 2 }),
    };
    const { xp: _xp, ...old } = valid;
    expect(parseCharacter({ ...old, schemaVersion: 0 }, migrations)).toEqual({ ok: true, character: valid });
  });

  test('migrates v1 to v2', () => {
    const { attributes: _a, talents: _t, specId: _s, hotbar: _h, ...v1 } = { ...valid, level: 7, xp: 321 };
    const r = parseCharacter({ ...v1, schemaVersion: 1 });
    expect(r).toEqual({ ok: true, character: { ...valid, level: 7, xp: 321 } });
  });

  test('keeps valid progress and sanitizes malformed parts', () => {
    const progress = {
      attributes: { strength: 3, agility: 0, intellect: 1, stamina: 0, spirit: 0 },
      talents: { might_1a: 2 },
      specId: 'warrior_tank',
      hotbar: ['cleave', null, 'shout', 'shield_wall'],
    };
    expect(parseCharacter({ ...valid, ...progress })).toEqual({ ok: true, character: { ...valid, ...progress } });
    const bad = { attributes: { strength: -1 }, talents: { x: 1.5, y: 'z' }, specId: 5, hotbar: ['a'] };
    expect(parseCharacter({ ...valid, ...bad })).toEqual({ ok: true, character: valid });
  });
});
