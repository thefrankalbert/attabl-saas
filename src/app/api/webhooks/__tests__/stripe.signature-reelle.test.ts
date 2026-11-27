import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';

/**
 * La route webhook Stripe avec le VRAI SDK: `constructEvent` n'est PAS simule.
 *
 * Les autres tests du webhook remplacent `constructEvent`: ils prouvent
 * l'aiguillage et l'idempotence, pas la signature. Ici la signature est
 * calculee par le SDK (`generateTestHeaderString`) avec un secret genere dans
 * le test, et verifiee par la route reelle, sur un evenement ajoute par
 * l'audit E11 (`radar.early_fraud_warning.created`). Aucun appel reseau: le
 * paiement est deplie dans l'evenement, donc le gestionnaire ne relit rien.
 */

const SECRET = `whsec_${randomBytes(24).toString('hex')}`;
const AUTRE_SECRET = `whsec_${randomBytes(24).toString('hex')}`;

const { signature, tables, mockFrom } = vi.hoisted(() => ({
  signature: { value: null as string | null },
  tables: [] as string[],
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from: mockFrom })) }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => (key === 'stripe-signature' ? signature.value : null),
  })),
}));
vi.mock('@/lib/stripe/server', async () => {
  const { default: VraiStripe } = await vi.importActual<typeof import('stripe')>('stripe');
  // Cle factice: le SDK ne la verifie qu'a l'appel d'API, jamais fait ici.
  const vrai = new VraiStripe('cle-locale-sans-reseau');
  return { getStripe: () => vrai };
});

import { POST } from '../stripe/route';
import { logger } from '@/lib/logger';

function brancherBase() {
  tables.length = 0;
  mockFrom.mockImplementation((table: string) => {
    tables.push(table);
    if (table === 'stripe_events') {
      return {
        insert: () => ({
          select: () => ({ maybeSingle: async () => ({ data: { id: 'evt_efw_1' }, error: null }) }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    if (table === 'tenants') {
      const ch = {
        eq: () => ch,
        maybeSingle: async () => ({ data: { id: 'tenant-1' }, error: null }),
      };
      return { select: () => ch };
    }
    throw new Error(`Table inattendue: ${table}`);
  });
}

const corps = JSON.stringify({
  id: 'evt_efw_1',
  object: 'event',
  type: 'radar.early_fraud_warning.created',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'issfr_1',
      object: 'radar.early_fraud_warning',
      actionable: true,
      charge: { id: 'ch_1', object: 'charge', customer: 'cus_1' },
      fraud_type: 'unauthorized_use_of_card',
      livemode: false,
      created: Math.floor(Date.now() / 1000),
    },
  },
});

function signer(payload: string, secret: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret });
}

function envoyer(payload: string): Promise<Response> {
  return POST(
    new Request('https://attabl.com/api/webhooks/stripe', { method: 'POST', body: payload }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'cle-locale-sans-reseau');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', SECRET);
  brancherBase();
});

describe('webhook Stripe, signature verifiee par le vrai SDK', () => {
  it('TEMOIN POSITIF: signature valide -> 200, evenement traite et alerte emise', async () => {
    signature.value = signer(corps, SECRET);

    const response = await envoyer(corps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('avertissement de fraude'),
      undefined,
      expect.objectContaining({ tenantId: 'tenant-1', chargeId: 'ch_1', actionable: true }),
    );
    expect(tables).toContain('tenants');
  });

  it('signature calculee avec un AUTRE secret -> 400, rien lu ni ecrit', async () => {
    signature.value = signer(corps, AUTRE_SECRET);

    const response = await envoyer(corps);

    expect(response.status).toBe(400);
    expect(tables).toEqual([]);
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining('avertissement de fraude'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('corps modifie apres signature -> 400, rien lu ni ecrit', async () => {
    signature.value = signer(corps, SECRET);

    const response = await envoyer(corps.replace('"actionable":true', '"actionable":false'));

    expect(response.status).toBe(400);
    expect(tables).toEqual([]);
  });

  it('horodatage hors tolerance (10 min) -> 400', async () => {
    signature.value = Stripe.webhooks.generateTestHeaderString({
      payload: corps,
      secret: SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 600,
    });

    const response = await envoyer(corps);

    expect(response.status).toBe(400);
    expect(tables).toEqual([]);
  });
});
