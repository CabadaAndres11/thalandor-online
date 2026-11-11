import type { Character } from './character';

export interface CharacterStore {
  /** False when the browser does not let us save (progress lives only in memory). */
  readonly persistent: boolean;
  list(): Promise<Character[]>;
  get(id: string): Promise<Character | undefined>;
  put(c: Character): Promise<void>;
  delete(id: string): Promise<void>;
}

const DB_NAME = 'thalandor';
const DB_VERSION = 1;
const STORE = 'characters';
const OPEN_TIMEOUT_MS = 3000;

const byCreated = (a: Character, b: Character) => a.createdAt - b.createdAt;
const clone = (c: Character): Character => structuredClone(c);

export class MemoryCharacterStore implements CharacterStore {
  readonly persistent: boolean = false;
  private readonly items = new Map<string, Character>();

  async list(): Promise<Character[]> {
    return [...this.items.values()].map(clone).sort(byCreated);
  }

  async get(id: string): Promise<Character | undefined> {
    const c = this.items.get(id);
    return c ? clone(c) : undefined;
  }

  async put(c: Character): Promise<void> {
    this.items.set(c.id, clone(c));
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

class IdbCharacterStore implements CharacterStore {
  readonly persistent = true;

  constructor(private readonly db: IDBDatabase) {}

  private tx(mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(STORE, mode).objectStore(STORE);
  }

  async list(): Promise<Character[]> {
    return ((await req(this.tx('readonly').getAll())) as Character[]).sort(byCreated);
  }

  async get(id: string): Promise<Character | undefined> {
    return (await req(this.tx('readonly').get(id))) as Character | undefined;
  }

  async put(c: Character): Promise<void> {
    await req(this.tx('readwrite').put(c));
  }

  async delete(id: string): Promise<void> {
    await req(this.tx('readwrite').delete(id));
  }
}

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('IndexedDB open timed out')), OPEN_TIMEOUT_MS);
    const r = idb.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => {
      clearTimeout(timer);
      resolve(r.result);
    };
    r.onerror = () => {
      clearTimeout(timer);
      reject(r.error ?? new Error('IndexedDB open failed'));
    };
    r.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('IndexedDB open blocked'));
    };
  });
}

/** Opens the browser database; falls back to an in-memory store when saving is not possible. */
export async function openCharacterStore(idb: IDBFactory | undefined = globalThis.indexedDB): Promise<CharacterStore> {
  if (!idb) return new MemoryCharacterStore();
  try {
    return new IdbCharacterStore(await openDb(idb));
  } catch {
    return new MemoryCharacterStore();
  }
}
