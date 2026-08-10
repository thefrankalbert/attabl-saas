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
// v2: ajout du store `identity`. Le service worker draine la file en Background
// Sync, dans un contexte sans React: sans identite persistee il ne pourrait
// rejouer AUCUNE entree nominative (elles le sont toutes depuis OFF-07), donc la
// synchro en arriere-plan deviendrait inerte - et les entrees finiraient par
// expirer au bout de MAX_AGE_MS, ce qui transformerait une degradation en perte.
// v3: ajout du store `rejected`. Une entree definitivement perdue (expiration a
// MAX_AGE_MS, rejet serveur, budget de tentatives epuise) doit rester visible
// APRES le contexte qui l'a constatee: le service worker draine sans React, et
// un state React disparait au rechargement. Sans ce store, une commande
// encaissee pouvait disparaitre sans laisser de trace a l'operateur.
const DB_VERSION = 3;
const STORE = 'order-outbox';
const IDENTITY_STORE = 'identity';
const IDENTITY_KEY = 'current';
const REJECTED_STORE = 'rejected';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE);
      }
      if (!db.objectStoreNames.contains(REJECTED_STORE)) {
        db.createObjectStore(REJECTED_STORE, { keyPath: 'id' });
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
    async claim(id: string, now: number, ttlMs: number): Promise<boolean> {
      const dbi = await openDb();
      try {
        // Lecture ET ecriture dans la MEME transaction readwrite: c'est ce qui
        // rend la reservation atomique vis-a-vis du service worker (OFF-09).
        // Un get suivi d'un put dans deux transactions laisserait la fenetre
        // exacte que ce correctif ferme.
        const tx = dbi.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const current = await promisify<OutboxEntry | undefined>(store.get(id));
        if (!current) {
          // Deja traitee et supprimee par l'autre contexte: ne rien recreer.
          return false;
        }
        if (current.claimedAt !== undefined && now - current.claimedAt < ttlMs) {
          return false;
        }
        await promisify(store.put({ ...current, claimedAt: now }));
        await txDone(tx);
        return true;
      } finally {
        dbi.close();
      }
    },
    async putIfPresent(entry: OutboxEntry): Promise<boolean> {
      const dbi = await openDb();
      try {
        const tx = dbi.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const current = await promisify<OutboxEntry | undefined>(store.get(entry.id));
        if (!current) return false;
        await promisify(store.put(entry));
        await txDone(tx);
        return true;
      } finally {
        dbi.close();
      }
    },
    async putRejected(entry: OutboxEntry): Promise<void> {
      const dbi = await openDb();
      try {
        const tx = dbi.transaction(REJECTED_STORE, 'readwrite');
        await promisify(tx.objectStore(REJECTED_STORE).put(entry));
        await txDone(tx);
      } finally {
        dbi.close();
      }
    },
    async listRejected(): Promise<OutboxEntry[]> {
      const dbi = await openDb();
      try {
        const tx = dbi.transaction(REJECTED_STORE, 'readonly');
        return await promisify(
          tx.objectStore(REJECTED_STORE).getAll() as IDBRequest<OutboxEntry[]>,
        );
      } finally {
        dbi.close();
      }
    },
    async clearRejected(): Promise<void> {
      const dbi = await openDb();
      try {
        const tx = dbi.transaction(REJECTED_STORE, 'readwrite');
        await promisify(tx.objectStore(REJECTED_STORE).clear());
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

/** Identite persistee, lisible depuis le service worker (OFF-07). */
export interface PersistedIdentity {
  userId: string;
  tenantId: string;
}

/** Ecrit (ou efface avec null) l'identite courante. Best-effort: ne leve jamais. */
export async function persistOutboxIdentity(identity: PersistedIdentity | null): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const dbi = await openDb();
    const tx = dbi.transaction(IDENTITY_STORE, 'readwrite');
    const store = tx.objectStore(IDENTITY_STORE);
    if (identity) {
      await promisify(store.put(identity, IDENTITY_KEY));
    } else {
      await promisify(store.delete(IDENTITY_KEY));
    }
    dbi.close();
  } catch {
    // Best-effort: sans identite persistee le worker ne drainera simplement pas
    // les entrees nominatives, ce qui est le comportement sur (rien n'est perdu).
  }
}

/** Lit l'identite persistee. Utilisable depuis le service worker. */
export async function readOutboxIdentity(): Promise<PersistedIdentity | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const dbi = await openDb();
    const tx = dbi.transaction(IDENTITY_STORE, 'readonly');
    const value = await promisify<PersistedIdentity | undefined>(
      tx.objectStore(IDENTITY_STORE).get(IDENTITY_KEY),
    );
    dbi.close();
    return value ?? null;
  } catch {
    return null;
  }
}
