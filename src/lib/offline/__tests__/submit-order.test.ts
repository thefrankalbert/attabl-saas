import { describe, it, expect, vi } from 'vitest';
import { submitOrder, replayOrderEntry } from '../submit-order';
import type { Outbox, OutboxEntry } from '../outbox';

/** Minimal fake outbox capturing enqueued entries. */
function fakeOutbox() {
  const entries: OutboxEntry[] = [];
  const outbox = {
    enqueue: vi.fn(async (input: { id: string; endpoint: string; body: unknown; now: number }) => {
      const entry: OutboxEntry = { ...input, attempts: 0, createdAt: input.now };
      entries.push(entry);
      return entry;
    }),
  } as unknown as Outbox;
  return { outbox, entries };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('submitOrder', () => {
  it('injects client_request_id and returns sent on 2xx', async () => {
    const { outbox } = fakeOutbox();
    const captured: RequestInit[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      if (init) captured.push(init);
      return jsonResponse(200, { orderId: 'o1' });
    });

    const result = await submitOrder({
      endpoint: '/api/orders/pos',
      body: { table_number: '5' },
      clientRequestId: 'key-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      outbox,
    });

    expect(result).toEqual({ status: 'sent', data: { orderId: 'o1' } });
    const sentBody = JSON.parse(captured[0]?.body as string);
    expect(sentBody.client_request_id).toBe('key-1');
    expect(sentBody.table_number).toBe('5');
  });

  it('queues durably on a network failure', async () => {
    const { outbox, entries } = fakeOutbox();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await submitOrder({
      endpoint: '/api/orders/pos',
      body: {},
      clientRequestId: 'key-2',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      outbox,
      now: 123,
    });

    expect(result).toEqual({ status: 'queued' });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('key-2');
    expect((entries[0]?.body as { client_request_id: string }).client_request_id).toBe('key-2');
  });

  it('queues on a transient 5xx', async () => {
    const { outbox, entries } = fakeOutbox();
    const fetchImpl = vi.fn(async () => jsonResponse(503, { error: 'unavailable' }));

    const result = await submitOrder({
      endpoint: '/api/orders/pos',
      body: {},
      clientRequestId: 'key-3',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      outbox,
    });

    expect(result.status).toBe('queued');
    expect(entries).toHaveLength(1);
  });

  it('queues on a 401 instead of rejecting (session can recover)', async () => {
    const { outbox, entries } = fakeOutbox();
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'Non authentifie' }));

    const result = await submitOrder({
      endpoint: '/api/orders/pos',
      body: {},
      clientRequestId: 'key-401',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      outbox,
    });

    expect(result.status).toBe('queued');
    expect(entries).toHaveLength(1);
  });

  it('rejects (does not queue) on a 4xx business error', async () => {
    const { outbox, entries } = fakeOutbox();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { error: 'Prix a change', details: ['Pizza'] }),
    );

    const result = await submitOrder({
      endpoint: '/api/orders/pos',
      body: {},
      clientRequestId: 'key-4',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      outbox,
    });

    expect(result).toEqual({ status: 'rejected', error: 'Prix a change', details: ['Pizza'] });
    expect(entries).toHaveLength(0);
  });

  it('returns failed when there is no durable store and the network is down', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });

    const result = await submitOrder({
      endpoint: '/api/orders/pos',
      body: {},
      clientRequestId: 'key-5',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      outbox: null,
    });

    expect(result.status).toBe('failed');
  });
});

describe('replayOrderEntry', () => {
  const entry = { endpoint: '/api/orders/pos', body: { client_request_id: 'k' } };

  it('returns success on 2xx', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { orderId: 'o' }));
    expect(await replayOrderEntry(entry, fetchImpl as unknown as typeof fetch)).toEqual({
      kind: 'success',
    });
  });

  it('returns retry that counts as an attempt on a server 5xx', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, {}));
    const outcome = await replayOrderEntry(entry, fetchImpl as unknown as typeof fetch);
    expect(outcome).toMatchObject({ kind: 'retry', countsAsAttempt: true });
  });

  it('retries a 401/403 but counts it (bounded, never an immortal entry)', async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi.fn(async () => jsonResponse(status, { error: 'Non authentifie' }));
      const outcome = await replayOrderEntry(entry, fetchImpl as unknown as typeof fetch);
      // Retryable (a session refreshes on reconnect) but bounded: a genuinely
      // forbidden request must eventually surface, not loop forever.
      expect(outcome).toMatchObject({ kind: 'retry', countsAsAttempt: true });
    }
  });

  it('returns retry that does NOT count as an attempt on a network throw', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('down');
    });
    const outcome = await replayOrderEntry(entry, fetchImpl as unknown as typeof fetch);
    expect(outcome).toMatchObject({ kind: 'retry', countsAsAttempt: false });
  });

  it('returns permanent on a genuine 4xx business reject', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(422, { error: 'stock epuise' }));
    const outcome = await replayOrderEntry(entry, fetchImpl as unknown as typeof fetch);
    expect(outcome).toEqual({ kind: 'permanent', reason: 'stock epuise' });
  });

  it('retries a 409 (concurrent replay of the same idempotency key in flight)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(409, { error: 'Requete en cours' }));
    const outcome = await replayOrderEntry(entry, fetchImpl as unknown as typeof fetch);
    expect(outcome).toMatchObject({ kind: 'retry', countsAsAttempt: true });
  });
});
