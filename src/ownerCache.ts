import type {OwnerData} from './api';

/**
 * The owner's last data, kept in this browser (IndexedDB: it is a few megabytes, too much for localStorage) so the
 * page shows it at once while the fresh data loads. Every call fails quietly: a private window, blocked storage or a
 * full disk only means waiting for the network, as before.
 */
const DATABASE = 'tillroll';
const STORE = 'owner';
const KEY = 'data';

function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function loadCachedOwnerData(): Promise<OwnerData | null> {
  try {
    return ((await run('readonly', store => store.get(KEY))) as OwnerData | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveCachedOwnerData(data: OwnerData) {
  try {
    await run('readwrite', store => store.put(data, KEY));
  } catch {
    // Not kept: the next visit loads from the network.
  }
}

/** Leaving owner mode takes the owner's data off this browser. */
export async function forgetCachedOwnerData() {
  try {
    await run('readwrite', store => store.delete(KEY));
  } catch {
    // Nothing kept, or storage blocked.
  }
}
