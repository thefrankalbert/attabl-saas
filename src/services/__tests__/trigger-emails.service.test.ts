import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const { sendTrialIdleEmail, sendTrialEndgameEmail, emailConfigured } = vi.hoisted(() => ({
  sendTrialIdleEmail: vi.fn(),
  sendTrialEndgameEmail: vi.fn(),
  emailConfigured: vi.fn(),
}));
vi.mock('../email.service', () => ({
  createEmailService: () => ({ sendTrialIdleEmail, sendTrialEndgameEmail }),
  isEmailDeliveryConfigured: () => emailConfigured(),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  determineTrialEventKey,
  isTrialIdle,
  sendTrialIdleEmails,
} from '../trigger-emails.service';

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
  // determineTrialEventKey lit l'heure reelle (getTrialDaysRemaining). Sans
  // horloge figee sur NOW, "fin d'essai dans 2 jours" est devenue une date
  // passee le 2026-11-26 et le test a casse tout seul.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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

const tenant = (id: string, lastActive: string | null, email: string | null = 'p@x.test'): Row => ({
  id,
  name: `Resto ${id}`,
  slug: `resto-${id}`,
  last_active_at: lastActive,
  owners: email ? [{ email }] : [],
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
    });
  });

  it('contre-audit 1: tri, filtres et plafond poses cote serveur', async () => {
    const { client, tenantFilters } = fakeDb({ tenants: [] });
    await sendTrialIdleEmails(client, NOW);
    expect(tenantFilters).toEqual(
      expect.arrayContaining([
        ['select', expect.stringContaining('owners:admin_users!inner(email)')],
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
