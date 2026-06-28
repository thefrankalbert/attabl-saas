/**
 * IndexedDB binding for the durable write outbox (browser-only).
 *
 * A thin promisified wrapper over a single object store - no third-party
 * dependency (the needs are tiny and a new client dep is supply-chain surface).
 * The pure queue logic lives in outbox.ts; this only implements OutboxStore.
 */

import type { OutboxStore, OutboxEntry } from './outbox';
import { createOutbox, type Outbox } from './outbox';

const DB_NAME = 'attabl-offline';
const DB_VERSION = 1;
const STORE = 'order-outbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** OutboxStore backed by IndexedDB. */
export function createIdbOutboxStore(): OutboxStore {
  return {
    async put(entry: OutboxEntry): Promise<void> {
      const dbi = await openDb();
      try {
        const tx = dbi.transaction(STORE, 'readwrite');
        await promisify(tx.objectStore(STORE).put(entry));
        await txDone(tx);
      } finally {
        dbi.close();
      }
    },
    async getAll(): Promise<OutboxEntry[]> {
      const dbi = await openDb();
      try {
        const tx = dbi.transaction(STORE, 'readonly');
        return await promisify(tx.objectStore(STORE).getAll() as IDBRequest<OutboxEntry[]>);
      } finally {
        dbi.close();
      }
    },
    async delete(id: string): Promise<void> {
      const dbi = await openDb();
      try {
        const tx = dbi.transaction(STORE, 'readwrite');
        await promisify(tx.objectStore(STORE).delete(id));
        await txDone(tx);
      } finally {
        dbi.close();
      }
    },
  };
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

let singleton: Outbox | null = null;

/**
 * The browser-wide order outbox. Returns null when IndexedDB is unavailable
 * (SSR, or a privacy mode that blocks it) so callers degrade gracefully.
 */
export function getOrderOutbox(): Outbox | null {
  if (typeof indexedDB === 'undefined') return null;
  if (!singleton) {
    singleton = createOutbox(createIdbOutboxStore());
  }
  return singleton;
}
