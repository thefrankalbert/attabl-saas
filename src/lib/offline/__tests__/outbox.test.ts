import { describe, it, expect } from 'vitest';
import {
  createOutbox,
  MAX_ATTEMPTS,
  type OutboxEntry,
  type OutboxStore,
  type ReplayOutcome,
} from '../outbox';

/** In-memory OutboxStore for testing the pure queue logic. */
function memoryStore(seed: OutboxEntry[] = []): OutboxStore {
  const map = new Map<string, OutboxEntry>(seed.map((e) => [e.id, e]));
  return {
    async put(entry) {
      map.set(entry.id, entry);
    },
    async getAll() {
      return [...map.values()];
    },
    async delete(id) {
      map.delete(id);
    },
  };
}

function entry(id: string, createdAt = 0): OutboxEntry {
  return {
    id,
    endpoint: '/api/orders/pos',
    body: { client_request_id: id },
    createdAt,
    attempts: 0,
  };
}

describe('createOutbox', () => {
  it('enqueues and lists oldest-first', async () => {
    const store = memoryStore();
    const ob = createOutbox(store);
    await ob.enqueue({ id: 'b', endpoint: '/x', body: {}, now: 200 });
    await ob.enqueue({ id: 'a', endpoint: '/x', body: {}, now: 100 });

    const list = await ob.list();
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
    expect(await ob.count()).toBe(2);
  });

  it('drops an entry on success', async () => {
    const store = memoryStore([entry('a')]);
    const ob = createOutbox(store);
    const result = await ob.drain(async () => ({ kind: 'success' }) as ReplayOutcome);

    expect(result.succeeded).toBe(1);
    expect(result.stillQueued).toBe(0);
    expect(await ob.count()).toBe(0);
  });

  it('drops and reports an entry on permanent rejection', async () => {
    const store = memoryStore([entry('a')]);
    const ob = createOutbox(store);
    const result = await ob.drain(
      async () => ({ kind: 'permanent', reason: 'price changed' }) as ReplayOutcome,
    );

    expect(result.succeeded).toBe(0);
    expect(result.permanentlyFailed).toHaveLength(1);
    expect(result.permanentlyFailed[0]?.lastError).toBe('price changed');
    expect(await ob.count()).toBe(0);
  });

  it('keeps and increments attempts on a retryable error', async () => {
    const store = memoryStore([entry('a')]);
    const ob = createOutbox(store);
    const result = await ob.drain(
      async () => ({ kind: 'retry', reason: 'http_503', countsAsAttempt: true }) as ReplayOutcome,
    );

    expect(result.stillQueued).toBe(1);
    expect(result.permanentlyFailed).toHaveLength(0);
    const [kept] = await ob.list();
    expect(kept?.attempts).toBe(1);
    expect(kept?.lastError).toBe('http_503');
  });

  it('keeps a network-unreachable retry WITHOUT burning an attempt', async () => {
    const store = memoryStore([{ ...entry('a'), attempts: MAX_ATTEMPTS }]);
    const ob = createOutbox(store);
    const result = await ob.drain(
      async () => ({ kind: 'retry', reason: 'network', countsAsAttempt: false }) as ReplayOutcome,
    );

    // At MAX_ATTEMPTS already, but a pure-network failure must not drop the order.
    expect(result.stillQueued).toBe(1);
    expect(result.permanentlyFailed).toHaveLength(0);
    const [kept] = await ob.list();
    expect(kept?.attempts).toBe(MAX_ATTEMPTS); // unchanged
    expect(kept?.lastError).toBe('network');
  });

  it('treats a thrown replay as network-unreachable (kept, not counted)', async () => {
    const store = memoryStore([entry('a')]);
    const ob = createOutbox(store);
    const result = await ob.drain(async () => {
      throw new Error('boom');
    });

    expect(result.stillQueued).toBe(1);
    const [kept] = await ob.list();
    expect(kept?.attempts).toBe(0);
  });

  it('gives up after MAX_ATTEMPTS retries', async () => {
    const store = memoryStore([{ ...entry('a'), attempts: MAX_ATTEMPTS }]);
    const ob = createOutbox(store);
    const result = await ob.drain(
      async () => ({ kind: 'retry', reason: 'still offline' }) as ReplayOutcome,
    );

    expect(result.stillQueued).toBe(0);
    expect(result.permanentlyFailed).toHaveLength(1);
    expect(result.permanentlyFailed[0]?.attempts).toBe(MAX_ATTEMPTS + 1);
  });

  it('processes a mixed batch correctly', async () => {
    const store = memoryStore([entry('ok', 1), entry('reject', 2), entry('retry', 3)]);
    const ob = createOutbox(store);
    const result = await ob.drain(async (e) => {
      if (e.id === 'ok') return { kind: 'success' };
      if (e.id === 'reject') return { kind: 'permanent', reason: 'no' };
      return { kind: 'retry', reason: 'later' };
    });

    expect(result.succeeded).toBe(1);
    expect(result.permanentlyFailed.map((e) => e.id)).toEqual(['reject']);
    expect(result.stillQueued).toBe(1);
    expect((await ob.list()).map((e) => e.id)).toEqual(['retry']);
  });
});
