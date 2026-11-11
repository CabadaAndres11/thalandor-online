import { defaultAppearance } from '../appearance/catalog';
import { createCharacter, MAX_CHARACTERS, type Character } from './character';
import { exportFileName, planImport } from './transfer';

const mk = (name: string, id = `id-${name}`): Character =>
  createCharacter({ name, classId: 'explorer', appearance: defaultAppearance('explorer') }, 1, id);
const json = (c: Character) => JSON.parse(JSON.stringify(c)) as unknown;

test('new character is added', () => {
  const c = mk('Ana');
  expect(planImport(json(c), [mk('Beto')])).toEqual({ kind: 'add', character: c });
});

test('same id plans replace', () => {
  const existing = mk('Ana');
  const incoming = { ...existing, xp: 50 };
  expect(planImport(json(incoming), [existing])).toEqual({ kind: 'replace', character: incoming });
});

test('full roster rejects with import.full', () => {
  const existing = Array.from({ length: MAX_CHARACTERS }, (_, i) => mk(`P${i}x`));
  expect(planImport(json(mk('Nuevo')), existing)).toEqual({ kind: 'error', error: 'import.full' });
});

test('replace is still allowed with a full roster', () => {
  const existing = Array.from({ length: MAX_CHARACTERS }, (_, i) => mk(`P${i}x`));
  expect(planImport(json(existing[0]!), existing).kind).toBe('replace');
});

test('duplicate name gets " 2" suffix', () => {
  const plan = planImport(json(mk('Ana', 'other')), [mk('Ana')]);
  expect(plan).toEqual({ kind: 'add', character: { ...mk('Ana', 'other'), name: 'Ana 2' } });
  const plan3 = planImport(json(mk('Ana', 'third')), [mk('Ana'), mk('Ana 2', 'x2')]);
  expect(plan3.kind === 'add' && plan3.character.name).toBe('Ana 3');
});

test('suffix keeps name within 16 chars', () => {
  const long = 'Abcdefghijklmnop';
  const plan = planImport(json(mk(long, 'other')), [mk(long)]);
  expect(plan.kind === 'add' && plan.character.name).toBe('Abcdefghijklmn 2');
});

test('corrupt input gives import.invalid; future version gives import.future', () => {
  for (const raw of [null, 'texto', { name: 'Ana' }, 42]) {
    expect(planImport(raw, [])).toEqual({ kind: 'error', error: 'import.invalid' });
  }
  expect(planImport({ ...json(mk('Ana')) as object, schemaVersion: 9 }, [])).toEqual({ kind: 'error', error: 'import.future' });
});

test('exportFileName sanitizes the name', () => {
  expect(exportFileName({ ...mk('x'), name: 'Ana María/<x>' })).toBe('thalandor-Ana-Maríax.json');
  expect(exportFileName(mk("d'Or-2"))).toBe('thalandor-dOr-2.json');
});
