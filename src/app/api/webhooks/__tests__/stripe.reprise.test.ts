/**
 * Reprise d'un evenement Stripe jamais abouti.
 *
 * La ligne d'idempotence est posee AVANT le traitement et retiree s'il echoue.
 * Si ce retrait echoue aussi, la ligne restait: tous les rejeux repondaient
 * "deja traite" et l'evenement n'etait jamais applique. `completed_at` (pose au
 * succes) permet au rejeu suivant de le reprendre.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

const { mockConstructEvent, mockHandleEvent } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockHandleEvent: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'stripe-signature': 'sig' })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/stripe/server', () => ({
  getStripe: () => ({ webhooks: { constructEvent: mockConstructEvent } }),
}));
vi.mock('@/services/stripe-webhook.service', () => ({
  createStripeWebhookService: () => ({ handleEvent: mockHandleEvent }),
}));

/** Etat de la ligne `stripe_events` que la fausse base rend et recoit. */
const ledger = {
  inserted: true,
  existing: null as { completed_at: string | null; processed_at: string } | null,
  completedUpdates: [] as Array<Record<string, unknown>>,
  insertedRows: [] as Array<Record<string, unknown>>,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        ledger.insertedRows.push(row);
        return {
          select: () => ({
            maybeSingle: async () => ({
              data: ledger.inserted ? { id: 'evt_1' } : null,
              error: ledger.inserted ? null : { code: '23505' },
            }),
          }),
        };
      },
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: ledger.existing, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => {
        ledger.completedUpdates.push(patch);
        return { eq: async () => ({ error: null }) };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import { POST } from '../stripe/route';

const minutesAgo = (n: number): string => new Date(Date.now() - n * 60_000).toISOString();

function call(): Promise<Response> {
  return POST(
    new Request('https://example.com/api/webhooks/stripe', { method: 'POST', body: 'x' }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  ledger.inserted = true;
  ledger.existing = null;
  ledger.completedUpdates = [];
  ledger.insertedRows = [];
  mockConstructEvent.mockReturnValue({
    id: 'evt_1',
    type: 'invoice.paid',
    data: { object: {} },
  } as unknown as Stripe.Event);
  mockHandleEvent.mockResolvedValue(undefined);
});

describe('webhook Stripe - reprise d un evenement jamais abouti', () => {
  it('un evenement neuf est insere sans date d aboutissement, puis marque abouti', async () => {
    const res = await call();

    expect(res.status).toBe(200);
    expect(ledger.insertedRows[0]).toMatchObject({ id: 'evt_1', completed_at: null });
    expect(mockHandleEvent).toHaveBeenCalledTimes(1);
    expect(ledger.completedUpdates).toHaveLength(1);
    expect(ledger.completedUpdates[0].completed_at).toEqual(expect.any(String));
  });

  it('temoin: un evenement deja abouti n est pas retraite', async () => {
    ledger.inserted = false;
    ledger.existing = { completed_at: minutesAgo(60), processed_at: minutesAgo(60) };

    const res = await call();

    expect(await res.json()).toEqual({ received: true, idempotent: true });
    expect(mockHandleEvent).not.toHaveBeenCalled();
  });

  it('un evenement ancien jamais abouti est retraite au rejeu', async () => {
    ledger.inserted = false;
    ledger.existing = { completed_at: null, processed_at: minutesAgo(60) };

    const res = await call();

    expect(await res.json()).toEqual({ received: true });
    expect(mockHandleEvent).toHaveBeenCalledTimes(1);
    expect(ledger.completedUpdates).toHaveLength(1);
  });

  it('un traitement encore en cours (ligne recente) n est pas double', async () => {
    ledger.inserted = false;
    ledger.existing = { completed_at: null, processed_at: minutesAgo(1) };

    const res = await call();

    expect(await res.json()).toEqual({ received: true, idempotent: true });
    expect(mockHandleEvent).not.toHaveBeenCalled();
  });

  it('un echec du traitement ne marque rien comme abouti', async () => {
    mockHandleEvent.mockRejectedValue(new Error('panne'));

    const res = await call();

    expect(res.status).toBe(500);
    expect(ledger.completedUpdates).toHaveLength(0);
  });
});
