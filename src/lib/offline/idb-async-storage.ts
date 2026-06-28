/**
 * IndexedDB-backed AsyncStorage for the TanStack Query persister (browser-only).
 *
 * The read cache used to live in localStorage, which is capped at ~5MB and runs
 * synchronously on the main thread - unsuitable for an offline-first tablet that
 * caches menus, orders and dashboard data. IndexedDB has no practical size cap
 * and is async. This adapter exposes the getItem/setItem/removeItem shape that
 * createAsyncStoragePersister expects.
 *
 * Thin and dependency-free (same rationale as outbox-idb). Every op is guarded:
 * if IndexedDB is unavailable or errors, reads return null and writes no-op, so
 * persistence simply degrades to "no cache" instead of breaking the app.
 */

const DB_NAME = 'attabl-query-cache';
const STORE = 'kv';
const DB_VERSION = 1;

export interface AsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/**
 * Returns an IndexedDB-backed AsyncStorage, or null when IndexedDB is missing
 * (SSR, or a privacy mode that blocks it) so the caller can fall back.
 */
export function createIdbAsyncStorage(): AsyncStorage | null {
  if (typeof indexedDB === 'undefined') return null;

  return {
    async getItem(key: string): Promise<string | null> {
      try {
        const db = await openDb();
        try {
          const tx = db.transaction(STORE, 'readonly');
          const value = await request(tx.objectStore(STORE).get(key) as IDBRequest<unknown>);
          return typeof value === 'string' ? value : null;
        } finally {
          db.close();
        }
      } catch {
        return null;
      }
    },
    async setItem(key: string, value: string): Promise<void> {
      try {
        const db = await openDb();
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(value, key);
          await txDone(tx);
        } finally {
          db.close();
        }
      } catch {
        // Persistence is best-effort; a write failure just means no cache.
      }
    },
    async removeItem(key: string): Promise<void> {
      try {
        const db = await openDb();
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(key);
          await txDone(tx);
        } finally {
          db.close();
        }
      } catch {
        // no-op
      }
    },
  };
}
