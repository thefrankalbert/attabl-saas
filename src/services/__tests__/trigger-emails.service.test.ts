import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
vi.mock('server-only', () => ({}));
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
  claimAndSendOrderEmail,
  claimAndSendTrialEmail,
  determineTrialEventKey,
  isTrialIdle,
  sendTrialIdleEmails,
} from '../trigger-emails.service';
import { readUnsubscribeToken } from '@/lib/email-unsubscribe-token';
import { logger } from '@/lib/logger';

const SECRET = 'un-secret-de-test-suffisamment-long-0123456789';
const ORIGINAL_SECRET = process.env.EMAIL_UNSUBSCRIBE_SECRET;
beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = SECRET;
  emailConfigured.mockReset().mockReturnValue(true);
  for (const m of [
    sendTrialIdleEmail,
    sendTrialEndgameEmail,
    sendFirstOrderTriggerEmail,
    sendTenthOrderTriggerEmail,
  ]) {
    m.mockReset().mockResolvedValue({ success: true });
  }
});
afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  else process.env.EMAIL_UNSUBSCRIBE_SECRET = ORIGINAL_SECRET;
});

/** L'adresse que porte le lien de desabonnement passe a l'envoi. */
function addressInLinks(data: { unsubscribe: { pageUrl: string; oneClickUrl: string } }) {
  const page = readUnsubscribeToken(new URL(data.unsubscribe.pageUrl).searchParams.get('t')!);
  const clic = readUnsubscribeToken(new URL(data.unsubscribe.oneClickUrl).searchParams.get('t')!);
  return { page, clic };
}

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

/**
 * Fausse base. `tenants`: rend les lignes triees, en appliquant le curseur
 * `or(...)` et la limite (le reste des filtres est retenu, pas applique). `email_unsubscribes`: rend les adresses de `unsubscribed`
 * presentes dans le `in`, ou `unsubscribeError`. `rpc`: retient les
 * reservations.
 */
function fakeDb(opts: {
  tenants?: Row[];
  claim?: boolean;
  unsubscribed?: string[];
  unsubscribeError?: boolean;
}) {
  const tenantFilters: unknown[][] = [];
  const claims: string[] = [];
  const unsubscribeReads: string[][] = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      if (table === 'email_unsubscribes') {
        let asked: string[] = [];
        chain.select = () => chain;
        chain.in = (_col: string, values: string[]) => ((asked = values), chain);
        chain.then = (ok: (v: unknown) => unknown) => {
          unsubscribeReads.push(asked);
          const result = opts.unsubscribeError
            ? { data: null, error: { message: 'lecture impossible' } }
            : {
                data: asked
                  .filter((e) => (opts.unsubscribed ?? []).includes(e))
                  .map((e) => ({ email_normalized: e })),
                error: null,
              };
          return Promise.resolve(result).then(ok);
        };
        return chain;
      }
      let after: { at: string; id: string } | null = null;
      let limit = Infinity;
      chain.select = (cols: string) => (tenantFilters.push(['select', cols]), chain);
      for (const m of ['eq', 'is', 'not', 'lt', 'gt', 'or', 'order', 'limit']) {
        chain[m] = (...args: unknown[]) => {
          tenantFilters.push([m, ...args]);
          const cursor =
            m === 'or'
              ? /last_active_at\.eq\."([^"]+)",id\.gt\.([^)]+)\)/.exec(String(args[0]))
              : null;
          if (cursor) after = { at: cursor[1], id: cursor[2] };
          if (m === 'limit') limit = args[0] as number;
          return chain;
        };
      }
      chain.then = (ok: (v: unknown) => unknown) => {
        // Meme ordre que la requete: last_active_at puis id.
        const sorted = [...(opts.tenants ?? [])].sort((a, b) =>
          String(a.last_active_at) === String(b.last_active_at)
            ? String(a.id).localeCompare(String(b.id))
            : String(a.last_active_at).localeCompare(String(b.last_active_at)),
        );
        const cur = after;
        return Promise.resolve({
          data: sorted
            .filter(
              (t) =>
                !cur ||
                String(t.last_active_at) > cur.at ||
                (String(t.last_active_at) === cur.at && String(t.id) > cur.id),
            )
            .slice(0, limit),
          error: null,
        }).then(ok);
      };
      return chain;
    },
    async rpc(_name: string, args: { p_tenant_id: string; p_event_key: string }) {
      claims.push(args.p_tenant_id);
      return { data: opts.claim ?? true, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, tenantFilters, claims, unsubscribeReads };
}

const tenant = (id: string, lastActive: string | null, email: string | null = 'p@x.test'): Row => ({
  id,
  name: `Resto ${id}`,
  slug: `resto-${id}`,
  last_active_at: lastActive,
  owners: email ? [{ email }] : [],
});

describe('sendTrialIdleEmails (B104)', () => {
  it('contre-audit 2: envoi non configure, rien n est lu ni reserve, aucune erreur', async () => {
    emailConfigured.mockReturnValue(false);
    const { client, claims, tenantFilters } = fakeDb({ tenants: [tenant('t1', ago(72))] });

    await expect(sendTrialIdleEmails(client, NOW)).resolves.toEqual({
      candidates: 0,
      sent: 0,
      unsubscribed: 0,
    });
    expect(claims).toEqual([]);
    expect(tenantFilters).toEqual([]);
    expect(sendTrialIdleEmail).not.toHaveBeenCalled();
  });

  it('relance un vrai inactif une fois, apres avoir reserve le creneau', async () => {
    const { client, claims } = fakeDb({ tenants: [tenant('t1', ago(72), 'proprio@resto.test')] });

    const report = await sendTrialIdleEmails(client, NOW);

    expect(report).toEqual({ candidates: 1, sent: 1, unsubscribed: 0 });
    expect(claims).toEqual(['t1']);
    expect(sendTrialIdleEmail).toHaveBeenCalledWith('proprio@resto.test', {
      restaurantName: 'Resto t1',
      dashboardUrl: expect.stringContaining('/sites/resto-t1/admin'),
      unsubscribe: expect.any(Object),
    });
    // Le lien porte l'adresse du destinataire, et seulement elle.
    expect(addressInLinks(sendTrialIdleEmail.mock.calls[0][1])).toEqual({
      page: 'proprio@resto.test',
      clic: 'proprio@resto.test',
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
        ['or', 'last_active_at.not.is.null'],
        ['order', 'last_active_at', { ascending: true }],
        ['order', 'id', { ascending: true }],
        ['limit', 50],
      ]),
    );
  });

  it('temoins: jamais vu, actif recemment, sans adresse, ou creneau deja pris: rien ne part', async () => {
    const { client, claims } = fakeDb({
      tenants: [tenant('jamais', null), tenant('recent', ago(5)), tenant('muet', ago(72), null)],
    });
    expect(await sendTrialIdleEmails(client, NOW)).toEqual({
      candidates: 0,
      sent: 0,
      unsubscribed: 0,
    });
    expect(claims).toEqual([]);

    const pris = fakeDb({ tenants: [tenant('t1', ago(72))], claim: false });
    expect(await sendTrialIdleEmails(pris.client, NOW)).toEqual({
      candidates: 1,
      sent: 0,
      unsubscribed: 0,
    });
    expect(sendTrialIdleEmail).not.toHaveBeenCalled();
  });
});

describe('lot desabonnement: relance d inactivite', () => {
  it('adresse desabonnee (casse et espaces ignores): ni reservation ni envoi', async () => {
    const { client, claims, unsubscribeReads } = fakeDb({
      tenants: [tenant('t1', ago(72), '  Proprio@Resto.TEST ')],
      unsubscribed: ['proprio@resto.test'],
    });
    expect(await sendTrialIdleEmails(client, NOW)).toEqual({
      candidates: 1,
      sent: 0,
      unsubscribed: 1,
    });
    expect(unsubscribeReads).toEqual([['proprio@resto.test']]);
    expect(claims).toEqual([]);
    expect(sendTrialIdleEmail).not.toHaveBeenCalled();
  });

  it('secret absent: rien n est lu ni reserve ni envoye', async () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    const { client, claims, tenantFilters } = fakeDb({ tenants: [tenant('t1', ago(72))] });
    expect(await sendTrialIdleEmails(client, NOW)).toEqual({
      candidates: 0,
      sent: 0,
      unsubscribed: 0,
    });
    expect(tenantFilters).toEqual([]);
    expect(claims).toEqual([]);
    expect(sendTrialIdleEmail).not.toHaveBeenCalled();
  });

  it('lecture des desabonnements en echec: erreur levee, rien reserve', async () => {
    const { client, claims } = fakeDb({
      tenants: [tenant('t1', ago(72))],
      unsubscribeError: true,
    });
    await expect(sendTrialIdleEmails(client, NOW)).rejects.toBeTruthy();
    expect(claims).toEqual([]);
    expect(sendTrialIdleEmail).not.toHaveBeenCalled();
  });

  it('50 desabonnes en tete de file ne confisquent pas la relance du suivant', async () => {
    const bloques = Array.from({ length: 50 }, (_, i) =>
      tenant(`d${i}`, ago(200 - i), `d${i}@resto.test`),
    );
    const { client, claims } = fakeDb({
      tenants: [...bloques, tenant('libre', ago(72), 'libre@resto.test')],
      unsubscribed: bloques.map((_, i) => `d${i}@resto.test`),
    });
    const report = await sendTrialIdleEmails(client, NOW);
    expect(report).toEqual({ candidates: 51, sent: 1, unsubscribed: 50 });
    expect(claims).toEqual(['libre']);
    expect(sendTrialIdleEmail).toHaveBeenCalledWith('libre@resto.test', expect.any(Object));
  });
});

describe('lot desabonnement: premiere et dixieme commande, fin d essai', () => {
  const target = {
    tenantId: 't1',
    adminEmail: 'Patron@Resto.test',
    restaurantName: 'Le Jardin',
    dashboardUrl: 'https://le-jardin.attabl.com/admin',
  };

  it('premiere commande: verifie, reserve, puis envoie avec les liens', async () => {
    const { client, claims, unsubscribeReads } = fakeDb({});
    await claimAndSendOrderEmail(client, 'first_order_email_sent', target);
    expect(unsubscribeReads).toEqual([['patron@resto.test']]);
    expect(claims).toEqual(['t1']);
    expect(sendFirstOrderTriggerEmail).toHaveBeenCalledTimes(1);
    expect(addressInLinks(sendFirstOrderTriggerEmail.mock.calls[0][1])).toEqual({
      page: 'patron@resto.test',
      clic: 'patron@resto.test',
    });
  });

  it('dixieme commande, adresse desabonnee: ni reservation ni envoi', async () => {
    const { client, claims } = fakeDb({ unsubscribed: ['patron@resto.test'] });
    await claimAndSendOrderEmail(client, 'tenth_order_email_sent', target);
    expect(claims).toEqual([]);
    expect(sendTenthOrderTriggerEmail).not.toHaveBeenCalled();
    // Temoin: la meme adresse non desabonnee recoit la relance.
    const libre = fakeDb({});
    await claimAndSendOrderEmail(libre.client, 'tenth_order_email_sent', target);
    expect(libre.claims).toEqual(['t1']);
    expect(sendTenthOrderTriggerEmail).toHaveBeenCalledTimes(1);
  });

  it('secret absent, envoi non configure ou lecture en echec: rien reserve', async () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    const sansSecret = fakeDb({});
    await claimAndSendOrderEmail(sansSecret.client, 'first_order_email_sent', target);
    expect(sansSecret.claims).toEqual([]);

    process.env.EMAIL_UNSUBSCRIBE_SECRET = SECRET;
    emailConfigured.mockReturnValue(false);
    const sansEnvoi = fakeDb({});
    await claimAndSendOrderEmail(sansEnvoi.client, 'first_order_email_sent', target);
    expect(sansEnvoi.claims).toEqual([]);

    emailConfigured.mockReturnValue(true);
    const enPanne = fakeDb({ unsubscribeError: true });
    await claimAndSendOrderEmail(enPanne.client, 'first_order_email_sent', target);
    expect(enPanne.claims).toEqual([]);
    expect(sendFirstOrderTriggerEmail).not.toHaveBeenCalled();
  });

  it('creneau deja pris: pas d envoi', async () => {
    const { client } = fakeDb({ claim: false });
    await claimAndSendOrderEmail(client, 'first_order_email_sent', target);
    expect(sendFirstOrderTriggerEmail).not.toHaveBeenCalled();
  });

  it('fin d essai: desabonne = rien; abonne = reserve et envoie', async () => {
    const trial = { ...target, trialEndsAt: inDays(2), ordersCount: 4 };
    const bloque = fakeDb({ unsubscribed: ['patron@resto.test'] });
    await claimAndSendTrialEmail(bloque.client, 'endgame_email_sent', trial);
    expect(bloque.claims).toEqual([]);
    expect(sendTrialEndgameEmail).not.toHaveBeenCalled();

    const libre = fakeDb({});
    await claimAndSendTrialEmail(libre.client, 'endgame_email_sent', trial);
    expect(libre.claims).toEqual(['t1']);
    expect(sendTrialEndgameEmail).toHaveBeenCalledWith(
      'Patron@Resto.test',
      expect.objectContaining({ ordersCount: 4, unsubscribe: expect.any(Object) }),
    );
  });
});

describe('journal des relances non envoyees (verif-visuelle, defaut 2)', () => {
  it('le contexte part dans le champ contexte, pas a la place de l erreur', async () => {
    vi.mocked(logger.error).mockClear();
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    await claimAndSendOrderEmail(fakeDb({}).client, 'first_order_email_sent', {
      tenantId: 't1',
      adminEmail: 'p@resto.test',
      restaurantName: 'R',
      dashboardUrl: 'https://r.attabl.com/admin',
    });
    emailConfigured.mockReturnValue(false);
    await claimAndSendOrderEmail(fakeDb({}).client, 'first_order_email_sent', {
      tenantId: 't2',
      adminEmail: 'p@resto.test',
      restaurantName: 'R',
      dashboardUrl: 'https://r.attabl.com/admin',
    });
    const calls = vi.mocked(logger.error).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [, error, context] of calls) {
      expect(error).toBeUndefined();
      expect(context).toEqual({ tenantId: expect.any(String), eventKey: 'first_order_email_sent' });
    }
  });
});
