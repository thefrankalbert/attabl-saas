import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleDisputeClosed, handleDisputeCreated } from '../dispute';
import { ServiceError } from '../../errors';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

/**
 * B91: une panne passagere de `paymentIntents.retrieve` faisait sortir
 * `handleDisputeCreated` sans ecrire ni lever. L'evenement etait consomme et le
 * restaurant n'etait JAMAIS gele pour le litige.
 * B92: `handleDisputeClosed` ne degelait que sur `won`; une demande de
 * renseignement classee sans suite (`warning_closed`, aucun argent retire)
 * laissait un client payant coupe.
 * Aucun test ne faisait passer `retrieve` (ni en succes ni en echec): tous les
 * tests de litige fournissaient un `payment_intent` deja etendu.
 */

function fakeDb(row: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  const from = () => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data: row, error: null });
    c.update = (p: Record<string, unknown>) => {
      updates.push(p);
      return c;
    };
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok);
    return c;
  };
  return { updates, client: { from } as unknown as SupabaseClient };
}

function fakeStripe(retrieve: () => Promise<unknown>) {
  return {
    paymentIntents: { retrieve: vi.fn(retrieve) },
    subscriptions: { retrieve: vi.fn(async () => ({ status: 'active' })) },
    charges: { list: vi.fn(async () => ({ data: [] })) },
    disputes: { list: vi.fn(async () => ({ data: [] })) },
  };
}

const dispute = (status: string): Stripe.Dispute =>
  ({ id: 'dp_1', status, payment_intent: 'pi_1' }) as unknown as Stripe.Dispute;

describe('handleDisputeCreated: client du litige lu chez Stripe (B91)', () => {
  it('retrieve en echec: leve INTERNAL pour que Stripe rejoue, sans rien ecrire', async () => {
    const db = fakeDb({ id: 't1', subscription_status: 'active', freeze_reason: null });
    const stripe = fakeStripe(async () => {
      throw new Error('429 rate limit');
    });
    const err = await handleDisputeCreated(
      { supabase: db.client, stripe: stripe as unknown as Stripe },
      dispute('needs_response'),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).code).toBe('INTERNAL');
    expect(db.updates).toEqual([]);
  });

  it('temoin: retrieve en succes, le gel pour litige est pose', async () => {
    const db = fakeDb({ id: 't1', subscription_status: 'active', freeze_reason: null });
    const stripe = fakeStripe(async () => ({ customer: 'cus_1' }));
    await handleDisputeCreated(
      { supabase: db.client, stripe: stripe as unknown as Stripe },
      dispute('needs_response'),
    );
    expect(db.updates[0]).toMatchObject({
      subscription_status: 'frozen',
      freeze_reason: 'dispute',
    });
  });

  it('paiement introuvable chez Stripe (resource_missing, permanent): consomme, pas rejoue', async () => {
    // Contre-audit D5: une erreur PERMANENTE rejouee pendant trois jours ne
    // changerait rien et fatiguerait l'endpoint.
    const db = fakeDb({ id: 't1', subscription_status: 'active', freeze_reason: null });
    const stripe = fakeStripe(async () => {
      throw Object.assign(new Error('No such payment_intent'), { code: 'resource_missing' });
    });
    await expect(
      handleDisputeCreated(
        { supabase: db.client, stripe: stripe as unknown as Stripe },
        dispute('needs_response'),
      ),
    ).resolves.toBeUndefined();
    expect(db.updates).toEqual([]);
  });

  it('temoin: paiement sans client (permanent), evenement consomme sans erreur', async () => {
    const db = fakeDb({ id: 't1', subscription_status: 'active', freeze_reason: null });
    const stripe = fakeStripe(async () => ({ customer: null }));
    await expect(
      handleDisputeCreated(
        { supabase: db.client, stripe: stripe as unknown as Stripe },
        dispute('needs_response'),
      ),
    ).resolves.toBeUndefined();
    expect(db.updates).toEqual([]);
  });
});

describe('handleDisputeClosed: litige regle sans perte (B92)', () => {
  const geleLitige = {
    id: 't1',
    subscription_status: 'frozen',
    freeze_reason: 'dispute',
    stripe_subscription_id: 'sub_1',
  };

  it('warning_closed (aucun argent retire): degel comme won', async () => {
    const db = fakeDb(geleLitige);
    const stripe = fakeStripe(async () => ({ customer: 'cus_1' }));
    await handleDisputeClosed(
      { supabase: db.client, stripe: stripe as unknown as Stripe },
      dispute('warning_closed'),
    );
    expect(db.updates[0]).toMatchObject({
      subscription_status: 'active',
      is_active: true,
      freeze_reason: null,
    });
  });

  it('temoin: un litige perdu laisse le restaurant gele, sans lecture', async () => {
    const db = fakeDb(geleLitige);
    const stripe = fakeStripe(async () => ({ customer: 'cus_1' }));
    await handleDisputeClosed(
      { supabase: db.client, stripe: stripe as unknown as Stripe },
      dispute('lost'),
    );
    expect(db.updates).toEqual([]);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('retrieve en echec a la fermeture: reste gele (fail-closed), sans erreur', async () => {
    const db = fakeDb(geleLitige);
    const stripe = fakeStripe(async () => {
      throw new Error('timeout');
    });
    await handleDisputeClosed(
      { supabase: db.client, stripe: stripe as unknown as Stripe },
      dispute('won'),
    );
    expect(db.updates).toEqual([]);
  });
});
