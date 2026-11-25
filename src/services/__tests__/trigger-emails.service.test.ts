import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const {
  sendTrialIdleEmail,
  sendTrialEndgameEmail,
  sendFirstOrderTriggerEmail,
  sendTenthOrderTriggerEmail,
  emailConfigured,
} = vi.hoisted(() => ({
  sendTrialIdleEmail: vi.fn(),
  sendTrialEndgameEmail: vi.fn(),
  sendFirstOrderTriggerEmail: vi.fn(),
  sendTenthOrderTriggerEmail: vi.fn(),
  emailConfigured: vi.fn(),
}));
vi.mock('../email.service', () => ({
  createEmailService: () => ({
    sendTrialIdleEmail,
    sendTrialEndgameEmail,
    sendFirstOrderTriggerEmail,
    sendTenthOrderTriggerEmail,
  }),
  isEmailDeliveryConfigured: () => emailConfigured(),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  determineTrialEventKey,
  findLifecycleRecipient,
  isTrialIdle,
  sendOrderEmailForKey,
  sendTrialEmailForKey,
  sendTrialIdleEmails,
} from '../trigger-emails.service';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'cle-de-test-serveur';

const NOW = new Date('2026-11-24T09:00:00Z');
const HOUR = 3_600_000;
const ago = (h: number) => new Date(NOW.getTime() - h * HOUR).toISOString();
const inDays = (d: number) => new Date(NOW.getTime() + d * 24 * HOUR).toISOString();

describe('isTrialIdle (B104)', () => {
  it('une date absente ou illisible n est pas une inactivite', () => {
    expect(isTrialIdle(null, NOW)).toBe(false);
    expect(isTrialIdle(undefined, NOW)).toBe(false);
    expect(isTrialIdle('pas une date', NOW)).toBe(false);
  });

  it('inactif a partir de 48 h de silence, pas avant', () => {
    expect(isTrialIdle(ago(47), NOW)).toBe(false);
    expect(isTrialIdle(ago(48), NOW)).toBe(true);
  });
});

describe('determineTrialEventKey (B104)', () => {
  it('ne rend plus jamais la relance d inactivite pendant une visite', () => {
    // Un nouvel inscrit (aucune visite enregistree) la recevait des sa premiere visite.
    expect(determineTrialEventKey({ trialEndsAt: inDays(10), activationEvents: {} })).toBeNull();
  });

  it('rend toujours la fin d essai proche', () => {
    expect(determineTrialEventKey({ trialEndsAt: inDays(2), activationEvents: {} })).toBe(
      'endgame_email_sent',
    );
  });
});

type Row = Record<string, unknown>;

/** Fausse base: rend les lignes telles quelles et retient les filtres poses. */
function fakeDb(opts: { tenants: Row[]; claim?: boolean }) {
  const tenantFilters: unknown[][] = [];
  const claims: string[] = [];
  const client = {
    from() {
      const chain: Record<string, unknown> = {};
      chain.select = (cols: string) => (tenantFilters.push(['select', cols]), chain);
      for (const m of ['eq', 'is', 'not', 'lt', 'gt', 'order', 'limit']) {
        chain[m] = (...args: unknown[]) => (tenantFilters.push([m, ...args]), chain);
      }
      chain.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: opts.tenants, error: null }).then(ok);
      return chain;
    },
    async rpc(_name: string, args: { p_tenant_id: string }) {
      claims.push(args.p_tenant_id);
      return { data: opts.claim ?? true, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, tenantFilters, claims };
}

const tenant = (
  id: string,
  lastActive: string | null,
  email: string | null = 'p@x.test',
  optedOutAt: string | null = null,
): Row => ({
  id,
  name: `Resto ${id}`,
  slug: `resto-${id}`,
  last_active_at: lastActive,
  owners: email ? [{ id: `owner-${id}`, email, lifecycle_emails_opt_out_at: optedOutAt }] : [],
});

describe('sendTrialIdleEmails (B104)', () => {
  beforeEach(() => {
    sendTrialIdleEmail.mockReset().mockResolvedValue({ success: true });
    emailConfigured.mockReset().mockReturnValue(true);
  });

  it('contre-audit 2: envoi non configure, rien n est lu ni reserve, aucune erreur', async () => {
    emailConfigured.mockReturnValue(false);
    const { client, claims, tenantFilters } = fakeDb({ tenants: [tenant('t1', ago(72))] });

    await expect(sendTrialIdleEmails(client, NOW)).resolves.toEqual({ candidates: 0, sent: 0 });
    expect(claims).toEqual([]);
    expect(tenantFilters).toEqual([]);
    expect(sendTrialIdleEmail).not.toHaveBeenCalled();
  });

  it('relance un vrai inactif une fois, apres avoir reserve le creneau', async () => {
    const { client, claims } = fakeDb({ tenants: [tenant('t1', ago(72), 'proprio@resto.test')] });

    const report = await sendTrialIdleEmails(client, NOW);

    expect(report).toEqual({ candidates: 1, sent: 1 });
    expect(claims).toEqual(['t1']);
    expect(sendTrialIdleEmail).toHaveBeenCalledWith('proprio@resto.test', {
      restaurantName: 'Resto t1',
      dashboardUrl: expect.stringContaining('/sites/resto-t1/admin'),
      unsubscribe: {
        pageUrl: expect.stringContaining('/unsubscribe?token='),
        oneClickUrl: expect.stringContaining('/api/email/unsubscribe?token='),
      },
    });
  });

  it('contre-audit 1: tri, filtres et plafond poses cote serveur', async () => {
    const { client, tenantFilters } = fakeDb({ tenants: [] });
    await sendTrialIdleEmails(client, NOW);
    expect(tenantFilters).toEqual(
      expect.arrayContaining([
        [
          'select',
          expect.stringContaining(
            'owners:admin_users!inner(id, email, lifecycle_emails_opt_out_at)',
          ),
        ],
        ['eq', 'subscription_status', 'trial'],
        ['eq', 'is_active', true],
        ['is', 'deleted_at', null],
        ['not', 'last_active_at', 'is', null],
        ['lt', 'last_active_at', ago(48)],
        ['is', 'activation_events->>idle_email_sent', null],
        ['eq', 'owners.role', 'owner'],
        ['eq', 'owners.is_active', true],
        ['is', 'owners.deleted_at', null],
        ['not', 'owners.email', 'is', null],
        ['is', 'owners.lifecycle_emails_opt_out_at', null],
        ['order', 'last_active_at', { ascending: true }],
        ['limit', 50],
      ]),
    );
  });

  it('temoins: jamais vu, actif recemment, sans adresse, ou creneau deja pris: rien ne part', async () => {
    const { client, claims } = fakeDb({
      tenants: [tenant('jamais', null), tenant('recent', ago(5)), tenant('muet', ago(72), null)],
    });
    expect(await sendTrialIdleEmails(client, NOW)).toEqual({ candidates: 1, sent: 0 });
    expect(claims).toEqual([]);

    const pris = fakeDb({ tenants: [tenant('t1', ago(72))], claim: false });
    expect(await sendTrialIdleEmails(pris.client, NOW)).toEqual({ candidates: 1, sent: 0 });
    expect(sendTrialIdleEmail).not.toHaveBeenCalled();
  });
});

describe('R5/T9: aucune relance a une personne desinscrite', () => {
  const TENANT = '22222222-2222-4222-8222-222222222222';
  const OWNER = '11111111-1111-4111-8111-111111111111';
  const SELF = '33333333-3333-4333-8333-333333333333';

  type AdminRow = { id: string; email: string | null; lifecycle_emails_opt_out_at: string | null };

  /** Fausse base admin_users: rend la ligne du proprietaire ou de la personne connectee. */
  function adminDb(rows: { owner?: AdminRow | null; self?: AdminRow | null }) {
    const queries: unknown[][][] = [];
    const client = {
      from(table: string) {
        const calls: unknown[][] = [['from', table]];
        queries.push(calls);
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'eq']) {
          chain[m] = (...args: unknown[]) => (calls.push([m, ...args]), chain);
        }
        chain.maybeSingle = async () => {
          const isOwner = calls.some((c) => c[0] === 'eq' && c[1] === 'role');
          return { data: (isOwner ? rows.owner : rows.self) ?? null, error: null };
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    return { client, queries };
  }

  beforeEach(() => {
    sendTrialIdleEmail.mockReset().mockResolvedValue({ success: true });
    sendTrialEndgameEmail.mockReset().mockResolvedValue({ success: true });
    sendFirstOrderTriggerEmail.mockReset().mockResolvedValue({ success: true });
    sendTenthOrderTriggerEmail.mockReset().mockResolvedValue({ success: true });
    emailConfigured.mockReset().mockReturnValue(true);
  });

  it('temoin: proprietaire abonne = destinataire, filtre par restaurant', async () => {
    const { client, queries } = adminDb({
      owner: { id: OWNER, email: 'patron@x.test', lifecycle_emails_opt_out_at: null },
    });
    expect(await findLifecycleRecipient(client, TENANT)).toEqual({
      adminUserId: OWNER,
      tenantId: TENANT,
      email: 'patron@x.test',
    });
    expect(queries[0]).toContainEqual(['eq', 'tenant_id', TENANT]);
  });

  it('proprietaire desinscrit = aucun destinataire, et pas de repli sur la personne connectee', async () => {
    const { client } = adminDb({
      owner: { id: OWNER, email: 'patron@x.test', lifecycle_emails_opt_out_at: ago(1) },
      self: { id: SELF, email: 'gerant@x.test', lifecycle_emails_opt_out_at: null },
    });
    expect(await findLifecycleRecipient(client, TENANT, { userId: 'u', email: 'u@x.test' })).toBe(
      null,
    );
  });

  it('repli sur la ligne de la personne connectee, sauf si elle est desinscrite', async () => {
    const abonne = adminDb({
      owner: null,
      self: { id: SELF, email: 'gerant@x.test', lifecycle_emails_opt_out_at: null },
    });
    expect(
      await findLifecycleRecipient(abonne.client, TENANT, { userId: 'u', email: 'u@x.test' }),
    ).toEqual({ adminUserId: SELF, tenantId: TENANT, email: 'gerant@x.test' });

    const desinscrit = adminDb({
      owner: null,
      self: { id: SELF, email: 'gerant@x.test', lifecycle_emails_opt_out_at: ago(1) },
    });
    expect(
      await findLifecycleRecipient(desinscrit.client, TENANT, { userId: 'u', email: 'u@x.test' }),
    ).toBeNull();

    const sansLigne = adminDb({ owner: null, self: null });
    expect(
      await findLifecycleRecipient(sansLigne.client, TENANT, { userId: 'u', email: 'u@x.test' }),
    ).toBeNull();
  });

  it('relance d inactivite: proprietaire desinscrit = aucun envoi ni reservation (temoin: abonne = envoi)', async () => {
    const desinscrit = fakeDb({ tenants: [tenant('t1', ago(72), 'p@x.test', ago(1))] });
    expect(await sendTrialIdleEmails(desinscrit.client, NOW)).toEqual({ candidates: 1, sent: 0 });
    expect(desinscrit.claims).toEqual([]);
    expect(sendTrialIdleEmail).not.toHaveBeenCalled();

    const abonne = fakeDb({ tenants: [tenant('t1', ago(72), 'p@x.test', null)] });
    expect(await sendTrialIdleEmails(abonne.client, NOW)).toEqual({ candidates: 1, sent: 1 });
    expect(sendTrialIdleEmail).toHaveBeenCalledTimes(1);
  });

  it('le lien de desinscription de chaque relance designe le destinataire', async () => {
    const recipient = { adminUserId: OWNER, tenantId: TENANT, email: 'patron@x.test' };
    const params = { recipient, restaurantName: 'R', dashboardUrl: 'https://attabl.com/x' };
    await sendOrderEmailForKey('first_order_email_sent', params);
    await sendOrderEmailForKey('tenth_order_email_sent', params);
    await sendTrialEmailForKey('endgame_email_sent', { ...params, trialEndsAt: inDays(2) });

    for (const fn of [
      sendFirstOrderTriggerEmail,
      sendTenthOrderTriggerEmail,
      sendTrialEndgameEmail,
    ]) {
      const [to, data] = fn.mock.calls[0] as [string, { unsubscribe: { oneClickUrl: string } }];
      expect(to).toBe('patron@x.test');
      const token = new URL(data.unsubscribe.oneClickUrl).searchParams.get('token') ?? '';
      expect(verifyUnsubscribeToken(token)).toEqual({ adminUserId: OWNER, tenantId: TENANT });
    }
  });
});
