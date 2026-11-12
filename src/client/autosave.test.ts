import { defaultAppearance } from '../appearance/catalog';
import { createCharacter } from '../save/character';
import { MemoryCharacterStore } from '../save/store';
import { AutoSaver, AUTOSAVE_INTERVAL_MS } from './autosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup(location: { x: number; y: number } | null = { x: 100, y: 200 }) {
  const store = new MemoryCharacterStore();
  const character = createCharacter({ name: 'Ana', classId: 'mage', appearance: defaultAppearance('mage') }, 1, 'id-1');
  await store.put(character);
  let loc = location;
  let clock = 1000;
  const saver = new AutoSaver({ store, character, mapId: 'test-arena', getLocation: () => loc, now: () => clock });
  return { store, saver, setLoc: (l: typeof loc) => (loc = l), setClock: (t: number) => (clock = t) };
}

test('interval is 30 seconds', () => {
  expect(AUTOSAVE_INTERVAL_MS).toBe(30_000);
});

test('saves lastLocation every 30s', async () => {
  const { store, saver, setLoc } = await setup();
  saver.start();
  await vi.advanceTimersByTimeAsync(29_999);
  expect((await store.get('id-1'))!.lastLocation).toBeNull();
  await vi.advanceTimersByTimeAsync(1);
  expect((await store.get('id-1'))!.lastLocation).toEqual({ mapId: 'test-arena', x: 100, y: 200 });
  setLoc({ x: 5, y: 6 });
  await vi.advanceTimersByTimeAsync(30_000);
  expect((await store.get('id-1'))!.lastLocation).toEqual({ mapId: 'test-arena', x: 5, y: 6 });
  saver.stop();
});

test('saveNow writes current location and updatedAt', async () => {
  const { store, saver, setClock } = await setup();
  setClock(5000);
  await saver.saveNow();
  const saved = (await store.get('id-1'))!;
  expect(saved.lastLocation).toEqual({ mapId: 'test-arena', x: 100, y: 200 });
  expect(saved.updatedAt).toBe(5000);
  expect(saved.name).toBe('Ana');
});

test('does not save when location is null', async () => {
  const { store, saver } = await setup(null);
  await saver.saveNow();
  expect((await store.get('id-1'))!.updatedAt).toBe(1);
});

test('stop prevents further saves', async () => {
  const { store, saver } = await setup();
  saver.start();
  saver.stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect((await store.get('id-1'))!.lastLocation).toBeNull();
});

test('save errors are swallowed (a failed save must not break the game)', async () => {
  const { saver, store } = await setup();
  vi.spyOn(store, 'put').mockRejectedValueOnce(new Error('quota'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(saver.saveNow()).resolves.toBeUndefined();
  warn.mockRestore();
});

test('does not resurrect a character deleted elsewhere (e.g. another tab)', async () => {
  const { store, saver } = await setup();
  await store.delete('id-1');
  await saver.saveNow();
  expect(await store.get('id-1')).toBeUndefined();
});

test('keeps newer fields written elsewhere and only patches the location', async () => {
  const { store, saver } = await setup();
  const imported = { ...(await store.get('id-1'))!, xp: 500, level: 4, appearance: { ...(await store.get('id-1'))!.appearance, hairColor: 'white' } };
  await store.put(imported);
  await saver.saveNow();
  const saved = (await store.get('id-1'))!;
  expect(saved.xp).toBe(500);
  expect(saved.level).toBe(4);
  expect(saved.appearance.hairColor).toBe('white');
  expect(saved.lastLocation).toEqual({ mapId: 'test-arena', x: 100, y: 200 });
});

test('saveProgress stores level, xp and choices without losing a concurrent location save', async () => {
  const { store, saver } = await setup();
  const p = {
    level: 4,
    xp: 12,
    xpToNext: 0,
    attributes: { strength: 0, agility: 0, intellect: 3, stamina: 0, spirit: 0 },
    freeAttrPoints: 12,
    talents: { arcane_1a: 2 },
    freeTalentPoints: 1,
    specId: null,
    hotbar: ['mage_blink', null, null, null],
    slots: { lmb: null, rmb: null, s1: null, s2: null, s3: null, s4: null },
    unlocked: [],
    passives: [],
    stats: {},
  };
  void saver.saveNow();
  await saver.saveProgress(p);
  const saved = (await store.get('id-1'))!;
  expect(saved).toMatchObject({ level: 4, xp: 12, attributes: p.attributes, talents: p.talents, specId: null, hotbar: p.hotbar });
  expect(saved.lastLocation).toEqual({ mapId: 'test-arena', x: 100, y: 200 });
});
