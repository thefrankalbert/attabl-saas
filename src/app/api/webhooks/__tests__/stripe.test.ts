import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Mocks - must be declared before importing the route module
// ---------------------------------------------------------------------------

// Use vi.hoisted() so mock fns are available when the vi.mock factory runs (hoisted)
const { mockConstructEvent, mockSubscriptionsRetrieve } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
}));

vi.mock('stripe', () => {
  return {
    default: class StripeMock {
      webhooks = { constructEvent: mockConstructEvent };
      subscriptions = { retrieve: mockSubscriptionsRetrieve };
    },
  };
});

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => (key === 'stripe-signature' ? 'sig_test' : null)),
    }),
  ),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Ensure env vars are set so getStripeClient/getWebhookSecret don't throw
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');

vi.mock('@/lib/stripe/server', () => ({
  getStripe: vi.fn().mockReturnValue({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
  }),
  STRIPE_PRICES: {},
  getPlanFromPriceId: vi.fn().mockReturnValue(null),
  getIntervalFromPriceId: vi.fn().mockReturnValue(null),
}));

// Import after mocks are set up
import { POST } from '../../webhooks/stripe/route';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Stripe event for testing. */
function makeStripeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: 'evt_test',
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

/** Build a fake Request with a text body. */
function makeRequest(body = 'raw_body'): Request {
  return new Request('https://example.com/api/webhooks/stripe', {
    method: 'POST',
    body,
  });
}

/** Configure the Supabase mock chain for a given table. */
function setupSupabaseChain(options: {
  selectResult?: { data: Record<string, unknown> | null; error: unknown };
  updateResult?: { error: unknown };
  idempotencyResult?: { data: { id: string } | null; error: unknown };
}) {
  // Chainable ET attendable, comme un builder PostgREST: une ecriture peut
  // porter plusieurs filtres (`.eq('id').is('stripe_subscription_id', null)`).
  const resultatEcriture = options.updateResult ?? { error: null };
  const chaineEcriture: {
    eq: () => typeof chaineEcriture;
    is: () => typeof chaineEcriture;
    then: (ok: (v: { error: unknown }) => unknown) => Promise<unknown>;
  } = {
    eq: () => chaineEcriture,
    is: () => chaineEcriture,
    then: (ok) => Promise.resolve(resultatEcriture).then(ok),
  };
  const eqAfterUpdate = vi.fn().mockReturnValue(chaineEcriture);
  const updateFn = vi.fn().mockReturnValue({ eq: eqAfterUpdate });

  const singleFn = vi.fn().mockResolvedValue(options.selectResult ?? { data: null, error: null });
  const eqAfterSelect = vi.fn().mockReturnValue({ single: singleFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqAfterSelect });

  // stripe_events idempotency chain: insert().select('id').maybeSingle()
  // Default: event is new (insert returns a row).
  const idempotencyMaybeSingle = vi
    .fn()
    .mockResolvedValue(options.idempotencyResult ?? { data: { id: 'evt_test' }, error: null });
  const idempotencySelect = vi.fn().mockReturnValue({ maybeSingle: idempotencyMaybeSingle });
  const idempotencyInsert = vi.fn().mockReturnValue({ select: idempotencySelect });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'stripe_events') {
      return { insert: idempotencyInsert };
    }
    return { select: selectFn, update: updateFn };
  });

  return {
    selectFn,
    eqAfterSelect,
    singleFn,
    updateFn,
    eqAfterUpdate,
    idempotencyInsert,
    idempotencyMaybeSingle,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stripe Webhook - POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // mapStripeStatus (tested indirectly via customer.subscription.updated)
  // =========================================================================

  describe('mapStripeStatus (via subscription.updated)', () => {
    /**
     * Helper: fires a customer.subscription.updated event with the given
     * Stripe status and returns the status that was written to the DB.
     */
    async function getWrittenStatus(stripeStatus: string): Promise<string> {
      const chain = setupSupabaseChain({
        // RES-1: 'past_due' ne s'ecrit que depuis un statut SAIN. Le double ne
        // portait aucun subscription_status, ce qui ne representait aucun tenant
        // reel; 'active' est l'etat d'ou part une degradation.
        selectResult: { data: { id: 'tenant-1', subscription_status: 'active' }, error: null },
      });

      const event = makeStripeEvent('customer.subscription.updated', {
        customer: 'cus_123',
        status: stripeStatus,
        items: { data: [{ current_period_start: 1000000, current_period_end: 2000000 }] },
      });
      mockConstructEvent.mockReturnValue(event);

      await POST(makeRequest());

      const updatePayload = chain.updateFn.mock.calls[0]?.[0] as
        Record<string, unknown> | undefined;
      return updatePayload?.subscription_status as string;
    }

    /** La valeur de is_active ecrite pour un statut Stripe donne. */
    async function getWrittenIsActive(stripeStatus: string): Promise<unknown> {
      const chain = setupSupabaseChain({
        // Meme raison que ci-dessus: un tenant sans statut n'existe pas.
        selectResult: { data: { id: 'tenant-1', subscription_status: 'active' }, error: null },
      });

      const event = makeStripeEvent('customer.subscription.updated', {
        customer: 'cus_123',
        status: stripeStatus,
        items: { data: [{ current_period_start: 1000000, current_period_end: 2000000 }] },
      });
      mockConstructEvent.mockReturnValue(event);

      await POST(makeRequest());

      const updatePayload = chain.updateFn.mock.calls[0]?.[0] as
        Record<string, unknown> | undefined;
      return updatePayload?.is_active;
    }

    // Trouve en audit: le gel posait is_active=false sans qu'aucun chemin ne le
    // remette a true. Un client gele qui payait restait eteint - vitrine morte,
    // commandes refusees - sans le moindre log. is_active doit suivre le statut
    // DANS LES DEUX SENS.
    it('is_active suit le statut dans les deux sens', async () => {
      expect(await getWrittenIsActive('active')).toBe(true);
      expect(await getWrittenIsActive('trialing')).toBe(true);
      // La relance Stripe est en cours: on ne coupe pas encore le service.
      expect(await getWrittenIsActive('past_due')).toBe(true);
      // Decision produit confirmee: pas de paiement, pas de vitrine.
      expect(await getWrittenIsActive('canceled')).toBe(false);
      expect(await getWrittenIsActive('unpaid')).toBe(false);
    });

    it('maps "trialing" to "trial"', async () => {
      expect(await getWrittenStatus('trialing')).toBe('trial');
    });

    it('maps "active" to "active"', async () => {
      expect(await getWrittenStatus('active')).toBe('active');
    });

    it('maps "canceled" to "cancelled"', async () => {
      expect(await getWrittenStatus('canceled')).toBe('cancelled');
    });

    it('maps "past_due" to "past_due"', async () => {
      expect(await getWrittenStatus('past_due')).toBe('past_due');
    });

    // F3: 'unpaid' est la FIN de la relance Stripe. Le mapper sur 'past_due',
    // qui reste entitlant, laissait le tenant garder son plan a vie quand le
    // reglage Stripe de fin de relance est "mark as unpaid" plutot que "cancel".
    it('maps "unpaid" to "frozen"', async () => {
      expect(await getWrittenStatus('unpaid')).toBe('frozen');
    });

    it('maps unknown status to "frozen" (fail-closed) and logs warning', async () => {
      expect(await getWrittenStatus('some_unknown_status')).toBe('frozen');
      expect(logger.warn).toHaveBeenCalledWith(
        'Unknown Stripe status, defaulting to frozen (fail-closed)',
        { stripeStatus: 'some_unknown_status' },
      );
    });

    it('maps "incomplete" to "past_due"', async () => {
      expect(await getWrittenStatus('incomplete')).toBe('past_due');
    });

    it('maps "incomplete_expired" to "cancelled"', async () => {
      expect(await getWrittenStatus('incomplete_expired')).toBe('cancelled');
    });
  });

  // =========================================================================
  // checkout.session.completed
  // =========================================================================

  describe('checkout.session.completed', () => {
    it('updates tenant with plan and billing info', async () => {
      const chain = setupSupabaseChain({});

      mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });

      const event = makeStripeEvent('checkout.session.completed', {
        metadata: {
          tenant_id: 'tenant-abc',
          plan: 'pro',
          billing_interval: 'yearly',
        },
        customer: 'cus_456',
        subscription: 'sub_789',
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      const body = (await response.json()) as { received: boolean };
      expect(body.received).toBe(true);

      // Verify the update call
      // Second argument: l'ecriture est conditionnelle et compte ses lignes
      // (course entre deux paiements, intrusion M-01).
      expect(chain.updateFn).toHaveBeenCalledWith(
        {
          stripe_customer_id: 'cus_456',
          stripe_subscription_id: 'sub_789',
          subscription_status: 'active',
          // Audit: un tenant gele qui souscrit doit retrouver sa vitrine. Sans
          // is_active, il payait et restait eteint.
          is_active: true,
          past_due_since: null,
          // LOT 7: la cause du gel est ecrite a CHAQUE ecriture de statut, et
          // vaut null des que le statut n'est pas 'frozen'. C'est cet effacement
          // systematique qui garantit qu'un gel futur n'heritera jamais de la
          // cause d'un gel precedent (voir lib/billing/freeze-reason).
          freeze_reason: null,
          subscription_plan: 'pro',
          billing_interval: 'yearly',
        },
        { count: 'exact' },
      );

      // Verify update targeted the correct tenant
      expect(chain.eqAfterUpdate).toHaveBeenCalledWith('id', 'tenant-abc');
    });
  });

  // =========================================================================
  // customer.subscription.updated
  // =========================================================================

  describe('customer.subscription.updated', () => {
    it('maps status and period dates to tenant record', async () => {
      const periodStart = 1700000000;
      const periodEnd = 1702592000;

      const chain = setupSupabaseChain({
        selectResult: { data: { id: 'tenant-xyz' }, error: null },
      });

      const event = makeStripeEvent('customer.subscription.updated', {
        customer: 'cus_sub',
        status: 'active',
        items: {
          data: [{ current_period_start: periodStart, current_period_end: periodEnd }],
        },
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      expect(chain.updateFn).toHaveBeenCalledWith({
        subscription_status: 'active',
        // Audit: is_active suit le statut dans les DEUX sens, sinon un tenant
        // gele qui repaie reste eteint sans que rien ne le signale.
        is_active: true,
        // F3: la date d'entree en impaye est effacee des que le statut redevient
        // sain, sinon le cron de gel finirait par geler un tenant qui a paye.
        past_due_since: null,
        // LOT 7: statut sain, donc aucune cause de gel.
        freeze_reason: null,
        billing_interval: 'monthly',
        subscription_current_period_start: new Date(periodStart * 1000).toISOString(),
        subscription_current_period_end: new Date(periodEnd * 1000).toISOString(),
      });
      expect(chain.eqAfterUpdate).toHaveBeenCalledWith('id', 'tenant-xyz');
    });
  });

  // =========================================================================
  // customer.subscription.deleted
  // =========================================================================

  describe('customer.subscription.deleted', () => {
    it('freezes tenant by setting frozen status and is_active false', async () => {
      const chain = setupSupabaseChain({
        selectResult: { data: { id: 'tenant-del' }, error: null },
      });

      const event = makeStripeEvent('customer.subscription.deleted', {
        customer: 'cus_del',
        status: 'canceled',
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      expect(chain.updateFn).toHaveBeenCalledWith({
        subscription_status: 'frozen',
        is_active: false,
        // LOT 7: la cause du gel. charge.dispute.closed ne leve que le gel
        // pose par un litige: celui-ci ne doit pas l'etre.
        freeze_reason: 'subscription_deleted',
        stripe_subscription_id: null,
      });
      expect(chain.eqAfterUpdate).toHaveBeenCalledWith('id', 'tenant-del');
      expect(logger.warn).toHaveBeenCalledWith('Tenant frozen - subscription deleted', {
        tenantId: 'tenant-del',
      });
    });
  });

  // =========================================================================
  // Intrusion M-02: evenement d'un abonnement qui n'est pas l'abonnement courant
  // =========================================================================

  describe('evenement d un autre abonnement (M-02)', () => {
    it('ne gele PAS un restaurant quand un ANCIEN abonnement est supprime', async () => {
      const chain = setupSupabaseChain({
        selectResult: {
          data: {
            id: 'tenant-paie',
            subscription_status: 'active',
            stripe_subscription_id: 'sub_courant',
          },
          error: null,
        },
      });
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('customer.subscription.deleted', {
          id: 'sub_ancien',
          customer: 'cus_paie',
          status: 'canceled',
        }),
      );

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);
      expect(chain.updateFn).not.toHaveBeenCalled();
    });

    it('gele toujours quand c est l abonnement COURANT qui est supprime (temoin)', async () => {
      const chain = setupSupabaseChain({
        selectResult: {
          data: {
            id: 'tenant-paie',
            subscription_status: 'active',
            stripe_subscription_id: 'sub_courant',
          },
          error: null,
        },
      });
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('customer.subscription.deleted', {
          id: 'sub_courant',
          customer: 'cus_paie',
          status: 'canceled',
        }),
      );

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);
      expect(chain.updateFn).toHaveBeenCalledWith(
        expect.objectContaining({ subscription_status: 'frozen', is_active: false }),
      );
    });

    it('ne met PAS en impaye sur l echec de la facture d un autre abonnement', async () => {
      const chain = setupSupabaseChain({
        selectResult: {
          data: {
            id: 'tenant-paie',
            subscription_status: 'active',
            stripe_subscription_id: 'sub_courant',
          },
          error: null,
        },
      });
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('invoice.payment_failed', {
          customer: 'cus_paie',
          parent: { subscription_details: { subscription: 'sub_doublon' } },
        }),
      );

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);
      expect(chain.updateFn).not.toHaveBeenCalled();
    });

    it('met toujours en impaye sur l echec de la facture de l abonnement COURANT (temoin)', async () => {
      const chain = setupSupabaseChain({
        selectResult: {
          data: {
            id: 'tenant-paie',
            subscription_status: 'active',
            stripe_subscription_id: 'sub_courant',
          },
          error: null,
        },
      });
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('invoice.payment_failed', {
          customer: 'cus_paie',
          parent: { subscription_details: { subscription: 'sub_courant' } },
        }),
      );

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);
      expect(chain.updateFn).toHaveBeenCalledWith(
        expect.objectContaining({ subscription_status: 'past_due' }),
      );
    });

    it('n applique PAS la mise a jour d un autre abonnement', async () => {
      const chain = setupSupabaseChain({
        selectResult: {
          data: {
            id: 'tenant-paie',
            subscription_status: 'active',
            stripe_subscription_id: 'sub_courant',
          },
          error: null,
        },
      });
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('customer.subscription.updated', {
          id: 'sub_ancien',
          customer: 'cus_paie',
          status: 'canceled',
          items: { data: [] },
        }),
      );

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);
      expect(chain.updateFn).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // invoice.payment_failed
  // =========================================================================

  describe('invoice.payment_failed', () => {
    it('marks tenant as past_due', async () => {
      const chain = setupSupabaseChain({
        // ACT-19: l'impaye ne s'applique QUE depuis un statut sain - la ligne
        // lue doit donc porter son statut, sinon rien n'est ecrit.
        selectResult: { data: { id: 'tenant-pay', subscription_status: 'active' }, error: null },
      });

      const event = makeStripeEvent('invoice.payment_failed', {
        customer: 'cus_pay',
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      expect(chain.updateFn).toHaveBeenCalledWith({
        subscription_status: 'past_due',
        // ACT-19: is_active suit le statut ici aussi, et la date d'entree en
        // impaye est posee pour que le cron puisse le borner.
        is_active: true,
        past_due_since: expect.any(String),
        // LOT 7: 'past_due' n'est pas un gel, la cause est donc effacee.
        freeze_reason: null,
      });
      expect(chain.eqAfterUpdate).toHaveBeenCalledWith('id', 'tenant-pay');
      expect(logger.warn).toHaveBeenCalledWith('Payment failed for tenant', {
        tenantId: 'tenant-pay',
      });
    });
  });

  // =========================================================================
  // Idempotency (replay protection)
  // =========================================================================

  describe('idempotency', () => {
    it('short-circuits and returns 200 when event id has already been processed', async () => {
      // Simulate ON CONFLICT DO NOTHING: insert returns data: null
      const chain = setupSupabaseChain({
        idempotencyResult: { data: null, error: null },
      });

      const event = makeStripeEvent('customer.subscription.updated', {
        customer: 'cus_replay',
        status: 'active',
        items: { data: [] },
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      const body = (await response.json()) as { received: boolean; idempotent: boolean };
      expect(body.idempotent).toBe(true);

      // Verify the handler never touched tenant state
      expect(chain.updateFn).not.toHaveBeenCalled();
      expect(chain.selectFn).not.toHaveBeenCalled();
    });

    it('returns 500 when idempotency insert fails with a non-conflict error', async () => {
      setupSupabaseChain({
        idempotencyResult: { data: null, error: { code: '42501', message: 'permission denied' } },
      });

      const event = makeStripeEvent('customer.subscription.updated', {
        customer: 'cus_x',
        status: 'active',
        items: { data: [] },
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(500);
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error handling', () => {
    it('returns 400 when signature verification fails', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const response = await POST(makeRequest());
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe('Invalid signature');
      expect(logger.error).toHaveBeenCalledWith(
        'Webhook signature verification failed',
        expect.any(Error),
        { errorMessage: 'Invalid signature' },
      );
    });

    it('warns and continues when tenant is not found (subscription.updated)', async () => {
      setupSupabaseChain({
        selectResult: { data: null, error: { message: 'not found' } },
      });

      const event = makeStripeEvent('customer.subscription.updated', {
        customer: 'cus_ghost',
        status: 'active',
        items: { data: [] },
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      const body = (await response.json()) as { received: boolean };
      expect(body.received).toBe(true);

      expect(logger.warn).toHaveBeenCalledWith('Subscription updated: tenant not found', {
        customerId: 'cus_ghost',
      });
    });
  });
});
