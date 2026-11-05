import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

/**
 * Le CONTRAT d'aiguillage du webhook Stripe, evenement par evenement.
 *
 * Les quatre autres fichiers de tests de ce webhook couvrent les regles d'acces
 * (qui a droit a quoi, et depuis quel etat). Celui-ci couvre ce qu'aucun ne
 * couvrait: pour CHAQUE type d'evenement, est-il traite ou ignore, qu'ecrit-il
 * exactement, et que fait la route autour de lui - verification de signature,
 * idempotence, et retrait de la ligne d'idempotence quand une ecriture echoue.
 *
 * C'est le filet volontairement black-box: il n'appelle que `POST`, jamais un
 * helper interne. Il doit donc rester vrai quelle que soit la facon dont le code
 * est decoupe derriere la route.
 */

const {
  mockConstructEvent,
  mockSubscriptionsRetrieve,
  mockChargesList,
  mockDisputesList,
  mockSignatureHeader,
} = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  mockChargesList: vi.fn(),
  mockDisputesList: vi.fn(),
  mockSignatureHeader: { value: 'sig_test' as string | null },
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => (key === 'stripe-signature' ? mockSignatureHeader.value : null)),
    }),
  ),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');

vi.mock('@/lib/stripe/server', () => ({
  getStripe: vi.fn().mockReturnValue({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
    charges: { list: mockChargesList },
    disputes: { list: mockDisputesList },
  }),
  STRIPE_PRICES: {},
  getPlanFromPriceId: vi.fn().mockReturnValue(null),
  getIntervalFromPriceId: vi.fn().mockReturnValue(null),
}));

import { POST } from '../stripe/route';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Double Supabase - builder postgrest chainable (.eq / .is / single / maybeSingle)
// ---------------------------------------------------------------------------

type QueryResult = { data: unknown; error: unknown };

interface Chain extends PromiseLike<QueryResult> {
  eq: (column: string, value: unknown) => Chain;
  is: (column: string, value: unknown) => Chain;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
}

interface MockOptions {
  /** Ligne tenant renvoyee par les select (null = introuvable). */
  tenant?: Record<string, unknown> | null;
  /** Erreurs renvoyees par les update successifs (defaut: aucune). */
  updateErrors?: unknown[];
  /** La ligne d'idempotence existe deja: Stripe rejoue l'evenement. */
  alreadyProcessed?: boolean;
  /** Erreur renvoyee par l'insert d'idempotence. */
  idempotencyError?: unknown;
  /** `from('tenants')` leve: simule une panne inattendue dans un gestionnaire. */
  tenantsThrows?: boolean;
}

function setupMock(options: MockOptions = {}) {
  const updatePayloads: Record<string, unknown>[] = [];
  const updateFilters: [string, unknown][] = [];
  const deletedEventIds: unknown[] = [];
  const tablesTouched: string[] = [];
  const updateErrors = [...(options.updateErrors ?? [])];

  const tenantRow = options.tenant === undefined ? { id: 'tenant-1' } : options.tenant;

  function makeChain(result: () => QueryResult, onFilter?: (c: string, v: unknown) => void): Chain {
    const chain: Chain = {
      eq: (column, value) => {
        onFilter?.(column, value);
        return chain;
      },
      is: (column, value) => {
        onFilter?.(column, value);
        return chain;
      },
      maybeSingle: () => Promise.resolve(result()),
      single: () => Promise.resolve(result()),
      then: (onFulfilled, onRejected) => Promise.resolve(result()).then(onFulfilled, onRejected),
    };
    return chain;
  }

  mockFrom.mockImplementation((table: string) => {
    tablesTouched.push(table);

    if (table === 'stripe_events') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: options.alreadyProcessed === true ? null : { id: 'evt_test' },
              error: options.idempotencyError ?? null,
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn((_column: string, value: unknown) => {
            deletedEventIds.push(value);
            return Promise.resolve({ error: null });
          }),
        }),
      };
    }

    if (table === 'tenants') {
      if (options.tenantsThrows === true) {
        throw new Error('panne inattendue');
      }
      return {
        select: vi.fn(() =>
          makeChain(() => ({
            data: tenantRow,
            error: tenantRow ? null : { message: 'not found' },
          })),
        ),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          const error = updateErrors.length > 0 ? updateErrors.shift() : null;
          return makeChain(
            () => ({ data: null, error: error ?? null }),
            (column, value) => updateFilters.push([column, value]),
          );
        }),
      };
    }

    throw new Error(`Table inattendue: ${table}`);
  });

  return { updatePayloads, updateFilters, deletedEventIds, tablesTouched };
}

function makeStripeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: 'evt_test', type, data: { object } } as unknown as Stripe.Event;
}

function makeRequest(): Request {
  return new Request('https://example.com/api/webhooks/stripe', {
    method: 'POST',
    body: 'raw_body',
  });
}

/** Arme la signature et renvoie l'evenement que la route verra. */
function fire(type: string, object: Record<string, unknown>): Promise<Response> {
  mockConstructEvent.mockReturnValue(makeStripeEvent(type, object));
  return POST(makeRequest());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSignatureHeader.value = 'sig_test';
  mockChargesList.mockResolvedValue({ data: [] });
  mockDisputesList.mockResolvedValue({ data: [] });
});

// ---------------------------------------------------------------------------
// Verification de signature - avant toute chose, et sans rien ecrire
// ---------------------------------------------------------------------------

describe('verification de signature', () => {
  it('refuse en 400 un appel sans en-tete stripe-signature, sans rien lire', async () => {
    const chain = setupMock();
    mockSignatureHeader.value = null;

    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Missing stripe-signature header' });
    // Aucune table n'est touchee: pas meme la ligne d'idempotence.
    expect(chain.tablesTouched).toEqual([]);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it('refuse en 400 une signature invalide, sans rien ecrire', async () => {
    const chain = setupMock();
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid signature' });
    expect(chain.tablesTouched).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Idempotence - un evenement rejoue ne refait AUCUN effet de bord
// ---------------------------------------------------------------------------

describe('idempotence', () => {
  it('court-circuite un evenement deja traite et ne touche pas la table tenants', async () => {
    const chain = setupMock({ alreadyProcessed: true });

    const response = await fire('customer.subscription.updated', {
      customer: 'cus_1',
      status: 'active',
      items: { data: [] },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, idempotent: true });
    expect(chain.tablesTouched).toEqual(['stripe_events']);
    expect(chain.updatePayloads).toEqual([]);
  });

  it('tolere le conflit 23505 renvoye par l insert et traite comme un rejeu', async () => {
    const chain = setupMock({
      alreadyProcessed: true,
      idempotencyError: { code: '23505', message: 'duplicate key' },
    });

    const response = await fire('customer.subscription.deleted', {
      customer: 'cus_1',
      status: 'canceled',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, idempotent: true });
    expect(chain.updatePayloads).toEqual([]);
  });

  it('renvoie 500 sans rien traiter quand l insert echoue pour une autre raison', async () => {
    const chain = setupMock({
      alreadyProcessed: true,
      idempotencyError: { code: '42501', message: 'permission denied' },
    });

    const response = await fire('invoice.paid', { customer: 'cus_1' });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(chain.updatePayloads).toEqual([]);
    // Rien n'a ete insere: il n'y a rien a retirer.
    expect(chain.deletedEventIds).toEqual([]);
  });

  it('retire la ligne d idempotence quand une ecriture echoue, pour que Stripe rejoue', async () => {
    const chain = setupMock({
      tenant: { id: 'tenant-1', subscription_status: 'active' },
      updateErrors: [{ message: 'db down' }],
    });

    const response = await fire('customer.subscription.updated', {
      customer: 'cus_1',
      status: 'active',
      items: { data: [] },
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'DB update failed' });
    expect(chain.deletedEventIds).toEqual(['evt_test']);
  });

  it('retire la ligne d idempotence quand un gestionnaire leve, et renvoie 500', async () => {
    const chain = setupMock({ tenantsThrows: true });

    const response = await fire('customer.subscription.updated', {
      customer: 'cus_1',
      status: 'active',
      items: { data: [] },
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Webhook handler failed' });
    expect(chain.deletedEventIds).toEqual(['evt_test']);
  });
});

// ---------------------------------------------------------------------------
// Evenements IGNORES - ils ne doivent rien ecrire, et rester en 200
// ---------------------------------------------------------------------------

describe('evenements sans effet de bord', () => {
  it('un type non gere est journalise et consomme, sans aucune lecture tenant', async () => {
    const chain = setupMock();

    const response = await fire('customer.created', { id: 'cus_1' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(chain.tablesTouched).toEqual(['stripe_events']);
    expect(logger.info).toHaveBeenCalledWith('Unhandled Stripe event type', {
      eventType: 'customer.created',
    });
  });

  it('invoice.payment_action_required ne fait que journaliser (3D Secure en cours)', async () => {
    const chain = setupMock();

    const response = await fire('invoice.payment_action_required', {
      customer: 'cus_1',
      id: 'in_1',
      hosted_invoice_url: 'https://invoice.example/1',
    });

    expect(response.status).toBe(200);
    expect(chain.tablesTouched).toEqual(['stripe_events']);
    expect(logger.info).toHaveBeenCalledWith('Payment action required', {
      customerId: 'cus_1',
      invoiceId: 'in_1',
      hostedInvoiceUrl: 'https://invoice.example/1',
    });
  });

  it('checkout.session.completed sans tenant_id en metadata ne lit ni n ecrit rien', async () => {
    const chain = setupMock();

    const response = await fire('checkout.session.completed', {
      metadata: {},
      customer: 'cus_1',
      subscription: 'sub_1',
    });

    expect(response.status).toBe(200);
    expect(chain.tablesTouched).toEqual(['stripe_events']);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.trial_will_end - le seul gestionnaire qui ne touche
// NI le statut, NI l'acces: il pose uniquement le drapeau d'avertissement.
// ---------------------------------------------------------------------------

describe('customer.subscription.trial_will_end', () => {
  it('pose trial_warning_sent et rien d autre', async () => {
    const chain = setupMock({ tenant: { id: 'tenant-1' } });

    const response = await fire('customer.subscription.trial_will_end', {
      customer: 'cus_1',
      status: 'trialing',
    });

    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toEqual([{ trial_warning_sent: true }]);
    expect(chain.updateFilters).toEqual([['id', 'tenant-1']]);
    expect(logger.info).toHaveBeenCalledWith('Trial ending soon, warning sent', {
      tenantId: 'tenant-1',
    });
  });

  it('se contente d un avertissement quand le tenant est introuvable', async () => {
    const chain = setupMock({ tenant: null });

    const response = await fire('customer.subscription.trial_will_end', {
      customer: 'cus_ghost',
      status: 'trialing',
    });

    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith('Trial will end: tenant not found', {
      customerId: 'cus_ghost',
    });
  });

  it('reste en 200 et GARDE la ligne d idempotence quand l ecriture du drapeau echoue', async () => {
    // Un drapeau d'affichage n'est pas de l'argent: faire rejouer Stripe
    // pendant trois jours pour ca serait disproportionne.
    const chain = setupMock({ tenant: { id: 'tenant-1' }, updateErrors: [{ message: 'db down' }] });

    const response = await fire('customer.subscription.trial_will_end', {
      customer: 'cus_1',
      status: 'trialing',
    });

    expect(response.status).toBe(200);
    expect(chain.deletedEventIds).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'DB update failed for trial_will_end',
      { message: 'db down' },
      { tenantId: 'tenant-1' },
    );
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.deleted - gel, et idempotence sur un tenant deja gele
// ---------------------------------------------------------------------------

describe('customer.subscription.deleted', () => {
  it('n ecrit rien quand le tenant est introuvable', async () => {
    const chain = setupMock({ tenant: null });

    const response = await fire('customer.subscription.deleted', {
      customer: 'cus_ghost',
      status: 'canceled',
    });

    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith('Subscription deleted: tenant not found', {
      customerId: 'cus_ghost',
    });
  });

  it('n ecrit rien quand le tenant est DEJA gele (idempotence du gestionnaire)', async () => {
    const chain = setupMock({ tenant: { id: 'tenant-1', subscription_status: 'frozen' } });

    const response = await fire('customer.subscription.deleted', {
      customer: 'cus_1',
      status: 'canceled',
    });

    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith(
      'customer.subscription.deleted already processed, skipping',
      { tenantId: 'tenant-1' },
    );
  });
});

// ---------------------------------------------------------------------------
// invoice.paid - le filet idempotent: aucune lecture, une ecriture scopee
// ---------------------------------------------------------------------------

describe('invoice.paid', () => {
  it('ecrit le bloc de retour a la normale, scope aux seuls impayes non coupes', async () => {
    const chain = setupMock();

    const response = await fire('invoice.paid', { customer: 'cus_1' });

    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toEqual([
      {
        subscription_status: 'active',
        past_due_since: null,
        is_active: true,
        freeze_reason: null,
      },
    ]);
    // Le scope EST la garde: 'frozen' est exclu (un litige ne se leve pas par la
    // facture du mois suivant), et les deux verrous humains aussi.
    expect(chain.updateFilters).toEqual([
      ['stripe_customer_id', 'cus_1'],
      ['subscription_status', 'past_due'],
      ['suspended_at', null],
      ['deleted_at', null],
    ]);
    expect(logger.info).toHaveBeenCalledWith('Invoice paid, subscription state reconciled', {
      customerId: 'cus_1',
    });
  });

  it('retire la ligne d idempotence quand l ecriture echoue', async () => {
    const chain = setupMock({ updateErrors: [{ message: 'db down' }] });

    const response = await fire('invoice.paid', { customer: 'cus_1' });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'DB update failed' });
    expect(chain.deletedEventIds).toEqual(['evt_test']);
  });
});

// ---------------------------------------------------------------------------
// charge.dispute.* - les sorties precoces, qui ne doivent rien ecrire
// ---------------------------------------------------------------------------

describe('charge.dispute.* - sorties sans ecriture', () => {
  it('charge.dispute.created sans client resolvable n ecrit rien', async () => {
    const chain = setupMock();

    const response = await fire('charge.dispute.created', { id: 'dp_1', payment_intent: null });

    expect(response.status).toBe(200);
    expect(chain.tablesTouched).toEqual(['stripe_events']);
    expect(logger.warn).toHaveBeenCalledWith('Dispute created without resolvable customer', {
      disputeId: 'dp_1',
    });
  });

  it('charge.dispute.closed perdu laisse le tenant gele, sans aucune lecture', async () => {
    const chain = setupMock();

    const response = await fire('charge.dispute.closed', {
      id: 'dp_1',
      status: 'lost',
      payment_intent: { customer: 'cus_1' },
    });

    expect(response.status).toBe(200);
    expect(chain.tablesTouched).toEqual(['stripe_events']);
    expect(logger.warn).toHaveBeenCalledWith('Dispute closed against us, tenant stays frozen', {
      disputeId: 'dp_1',
      status: 'lost',
    });
  });

  it('charge.dispute.closed gagne sans client resolvable n ecrit rien', async () => {
    const chain = setupMock();

    const response = await fire('charge.dispute.closed', {
      id: 'dp_1',
      status: 'won',
      payment_intent: null,
    });

    expect(response.status).toBe(200);
    expect(chain.tablesTouched).toEqual(['stripe_events']);
  });
});
