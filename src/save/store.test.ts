import { IDBFactory } from 'fake-indexeddb';
import { defaultAppearance } from '../appearance/catalog';
import { createCharacter } from './character';
import { MemoryCharacterStore, openCharacterStore } from './store';

const mk = (name: string, createdAt: number) =>
  createCharacter({ name, classId: 'warrior', appearance: defaultAppearance('warrior') }, createdAt, `id-${name}`);

test('put, get, list and delete roundtrip', async () => {
  const store = await openCharacterStore(new IDBFactory());
  expect(store.persistent).toBe(true);
  const a = mk('Ana', 1);
  await store.put(a);
  expect(await store.get('id-Ana')).toEqual(a);
  expect(await store.list()).toEqual([a]);
  await store.put({ ...a, xp: 5 });
  expect((await store.get('id-Ana'))?.xp).toBe(5);
  await store.delete('id-Ana');
  expect(await store.get('id-Ana')).toBeUndefined();
  expect(await store.list()).toEqual([]);
});

test('list is ordered by createdAt', async () => {
  const store = await openCharacterStore(new IDBFactory());
  await store.put(mk('Zoe', 30));
  await store.put(mk('Ana', 10));
  await store.put(mk('Beto', 20));
  expect((await store.list()).map((c) => c.name)).toEqual(['Ana', 'Beto', 'Zoe']);
});

test('data persists across reopen with same factory', async () => {
  const idb = new IDBFactory();
  const first = await openCharacterStore(idb);
  await first.put(mk('Ana', 1));
  const second = await openCharacterStore(idb);
  expect((await second.list()).map((c) => c.name)).toEqual(['Ana']);
});

test('falls back to memory store when IndexedDB open fails', async () => {
  const failing = {
    open() {
      const req: { onerror: null | (() => void); onsuccess: unknown; onupgradeneeded: unknown; onblocked: unknown; error: Error } = {
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        onblocked: null,
        error: new Error('denied'),
      };
      setTimeout(() => req.onerror?.(), 0);
      return req;
    },
  } as unknown as IDBFactory;
  const store = await openCharacterStore(failing);
  expect(store.persistent).toBe(false);
  await store.put(mk('Ana', 1));
  expect((await store.list()).length).toBe(1);
});

test('falls back to memory store when open throws', async () => {
  const throwing = { open: () => { throw new Error('SecurityError'); } } as unknown as IDBFactory;
  expect((await openCharacterStore(throwing)).persistent).toBe(false);
});

test('falls back when indexedDB is undefined', async () => {
  const store = await openCharacterStore(undefined);
  expect(store).toBeInstanceOf(MemoryCharacterStore);
  expect(store.persistent).toBe(false);
});

test('memory store returns copies, not live references', async () => {
  const store = new MemoryCharacterStore();
  const a = mk('Ana', 1);
  await store.put(a);
  (await store.get('id-Ana'))!.xp = 99;
  expect((await store.get('id-Ana'))!.xp).toBe(0);
});
