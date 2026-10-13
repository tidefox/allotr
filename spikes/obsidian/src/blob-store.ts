// The database file lives in IndexedDB, one record per vault.
const DB_NAME = 'allotr-spike';
const STORE = 'blobs';

export interface BlobStore {
  load(): Promise<Uint8Array | null>;
  save(bytes: Uint8Array): Promise<void>;
  remove(): Promise<void>;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export function indexedDbBlobStore(key: string): BlobStore {
  return {
    async load() {
      const value = await run<unknown>('readonly', (s) => s.get(key));
      return value instanceof Uint8Array ? value : null;
    },
    async save(bytes) {
      await run('readwrite', (s) => s.put(bytes, key));
    },
    async remove() {
      await run('readwrite', (s) => s.delete(key));
    },
  };
}

/** For throwaway databases: nothing is stored. */
export const noBlobStore: BlobStore = {
  load: () => Promise.resolve(null),
  save: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};
