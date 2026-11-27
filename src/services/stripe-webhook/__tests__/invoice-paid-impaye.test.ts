import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleInvoicePaid } from '../invoice';
import { ServiceError } from '../../errors';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

/**
 * Audit X8: `invoice.paid` faisait passer `past_due` a `active` (et effacait
 * `past_due_since`, donc le compteur de grace) sans relire l'abonnement. Une
 * vieille facture reglee alors qu'une plus recente reste impayee, ou un
 * `invoice.paid` arrive apres l'evenement qui a remis l'abonnement en impaye,
 * levait l'impaye a tort. Desormais Stripe est relu et seul `active` ou
 * `trialing` leve l'impaye.
 *
 * Fausse table `tenants` qui APPLIQUE les filtres eq / is envoyes par le code.
 */
type Row = Record<string, unknown>;
type Filtre = [string, unknown];

function fausseBase(row: Row) {
  const rows = [row];
  const match = (r: Row, f: Filtre[]) => f.every(([c, v]) => r[c] === v);
  const ecritures: Row[] = [];
  const lectures: string[] = [];
  const from = () => ({
    select: (columns: string) => {
      lectures.push(columns);
      const f: Filtre[] = [];
      const ch: Record<string, unknown> = {
        eq: (c: string, v: unknown) => (f.push([c, v]), ch),
        or: () => ch,
        maybeSingle: async () => ({ data: rows.find((r) => match(r, f)) ?? null, error: null }),
      };
      return ch;
    },
    update: (payload: Row) => {
      const f: Filtre[] = [];
      const ch: Record<string, unknown> = {
        eq: (c: string, v: unknown) => (f.push([c, v]), ch),
        is: (c: string, v: unknown) => (f.push([c, v]), ch),
        or: () => ch,
        then: (ok: (x: unknown) => unknown) => {
          rows
            .filter((r) => match(r, f))
            .forEach((r) => {
              ecritures.push(payload);
              Object.assign(r, payload);
            });
          return Promise.resolve({ error: null }).then(ok);
        },
      };
      return ch;
    },
  });
  return { supabase: { from } as unknown as SupabaseClient, row, ecritures, lectures };
}

function fauxStripe(retrieve: () => Promise<unknown>) {
  const s = { subscriptions: { retrieve: vi.fn(retrieve) } };
  return { stripe: s as unknown as Stripe, retrieve: s.subscriptions.retrieve };
}
const statut = (status: string) => () => Promise.resolve({ id: 'sub_1', status });

function enImpaye(over: Row = {}): Row {
  return {
    id: 't1',
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    subscription_status: 'past_due',
    past_due_since: '2026-11-01T10:00:00.000Z',
    is_active: true,
    suspended_at: null,
    deleted_at: null,
    ...over,
  };
}

const facture = (over: Record<string, unknown> = {}): Stripe.Invoice =>
  ({
    id: 'in_old',
    customer: 'cus_1',
    amount_paid: 5000,
    created: Math.floor(Date.parse('2026-10-01T10:00:00.000Z') / 1000),
    parent: { subscription_details: { subscription: 'sub_1' } },
    ...over,
  }) as unknown as Stripe.Invoice;

describe('invoice.paid ne leve l impaye que si Stripe dit l abonnement en regle (X8)', () => {
  it('abonnement encore past_due chez Stripe: rien n est ecrit, le compteur de grace reste', async () => {
    const base = fausseBase(enImpaye());
    const { stripe, retrieve } = fauxStripe(statut('past_due'));

    await handleInvoicePaid({ supabase: base.supabase, stripe }, facture());

    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(base.ecritures).toEqual([]);
    expect(base.row.subscription_status).toBe('past_due');
    expect(base.row.past_due_since).toBe('2026-11-01T10:00:00.000Z');
  });

  it.each(['unpaid', 'canceled', 'incomplete'])(
    'abonnement %s chez Stripe: l impaye n est pas leve',
    async (s) => {
      const base = fausseBase(enImpaye());
      const { stripe } = fauxStripe(statut(s));
      await handleInvoicePaid({ supabase: base.supabase, stripe }, facture());
      expect(base.ecritures).toEqual([]);
    },
  );

  it.each(['active', 'trialing'])(
    'TEMOIN: abonnement %s chez Stripe, l impaye est leve comme avant',
    async (s) => {
      const base = fausseBase(enImpaye());
      const { stripe } = fauxStripe(statut(s));

      await handleInvoicePaid({ supabase: base.supabase, stripe }, facture());

      expect(base.row.subscription_status).toBe('active');
      expect(base.row.past_due_since).toBeNull();
    },
  );

  it('restaurant qui n est pas en impaye: Stripe n est pas relu (aucun appel inutile)', async () => {
    const base = fausseBase(enImpaye({ subscription_status: 'active', past_due_since: null }));
    const { stripe, retrieve } = fauxStripe(statut('active'));

    await handleInvoicePaid({ supabase: base.supabase, stripe }, facture());

    expect(retrieve).not.toHaveBeenCalled();
    expect(base.lectures[0]).toContain('subscription_status');
  });

  it('Stripe illisible: ServiceError INTERNAL (la route retire la ligne, Stripe rejoue), rien ecrit', async () => {
    const base = fausseBase(enImpaye());
    const { stripe } = fauxStripe(() => Promise.reject(new Error('timeout')));

    const err = await handleInvoicePaid({ supabase: base.supabase, stripe }, facture()).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).code).toBe('INTERNAL');
    expect(base.ecritures).toEqual([]);
  });

  it('abonnement introuvable chez Stripe (permanent): evenement consomme, impaye maintenu', async () => {
    const base = fausseBase(enImpaye());
    const { stripe } = fauxStripe(() =>
      Promise.reject(Object.assign(new Error('No such'), { code: 'resource_missing' })),
    );

    await expect(
      handleInvoicePaid({ supabase: base.supabase, stripe }, facture()),
    ).resolves.toBeUndefined();
    expect(base.ecritures).toEqual([]);
  });

  it('facture sans abonnement (non relisible): le filet F10 s applique comme avant', async () => {
    const base = fausseBase(enImpaye());
    const { stripe, retrieve } = fauxStripe(statut('past_due'));

    await handleInvoicePaid({ supabase: base.supabase, stripe }, facture({ parent: null }));

    expect(retrieve).not.toHaveBeenCalled();
    expect(base.row.subscription_status).toBe('active');
  });
});
