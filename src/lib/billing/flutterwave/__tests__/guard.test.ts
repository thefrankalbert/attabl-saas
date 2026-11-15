import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/services/__tests__/helpers/fake-supabase';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

let currentClient: unknown;
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => currentClient }));

import { refuseIfPaidByFlutterwave } from '../guard';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const T = '11111111-2222-3333-4444-555555555555';

function payment(over: Record<string, unknown> = {}) {
  return {
    tenant_id: T,
    status: 'successful',
    period_end: '2026-12-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  currentClient = createFakeSupabase({ flutterwave_payments: [] }).client;
});

describe('refuseIfPaidByFlutterwave', () => {
  it('periode payee en cours: 409 EXISTING_FLUTTERWAVE_SUBSCRIPTION', async () => {
    currentClient = createFakeSupabase({ flutterwave_payments: [payment()] }).client;
    const res = await refuseIfPaidByFlutterwave(T, NOW);
    expect(res?.status).toBe(409);
    expect(await res?.json()).toMatchObject({ code: 'EXISTING_FLUTTERWAVE_SUBSCRIPTION' });
  });

  it('aucun paiement: la voie est libre (temoin negatif)', async () => {
    expect(await refuseIfPaidByFlutterwave(T, NOW)).toBeNull();
  });

  it('periode terminee: la voie est libre', async () => {
    currentClient = createFakeSupabase({
      flutterwave_payments: [payment({ period_end: '2026-11-01T00:00:00.000Z' })],
    }).client;
    expect(await refuseIfPaidByFlutterwave(T, NOW)).toBeNull();
  });

  it('ligne en attente (jamais payee): la voie est libre', async () => {
    currentClient = createFakeSupabase({
      flutterwave_payments: [payment({ status: 'pending', period_end: null })],
    }).client;
    expect(await refuseIfPaidByFlutterwave(T, NOW)).toBeNull();
  });

  it('paiement d un AUTRE restaurant: la voie est libre', async () => {
    currentClient = createFakeSupabase({
      flutterwave_payments: [payment({ tenant_id: '99999999-2222-3333-4444-555555555555' })],
    }).client;
    expect(await refuseIfPaidByFlutterwave(T, NOW)).toBeNull();
  });

  it('table absente (migration pas encore appliquee): la voie est libre', async () => {
    currentClient = {
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'gt', 'limit']) q[m] = () => q;
        q.then = (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { code: '42P01' } }).then(ok);
        return q;
      },
    };
    expect(await refuseIfPaidByFlutterwave(T, NOW)).toBeNull();
  });

  it('autre erreur de lecture: 503, on n ouvre pas la caisse dans le doute', async () => {
    currentClient = {
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'gt', 'limit']) q[m] = () => q;
        q.then = (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { code: 'XX000' } }).then(ok);
        return q;
      },
    };
    expect((await refuseIfPaidByFlutterwave(T, NOW))?.status).toBe(503);
  });
});
