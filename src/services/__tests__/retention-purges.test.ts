import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createRetentionService } from '../retention.service';
import { RETENTION } from '@/lib/legal/retention';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Purges ajoutees le 2026-11-15: invitations, abonnements push, journaux d'audit,
 * restaurants clos. Chaque test verifie la LIGNE QUI RESTE autant que celle qui
 * part: une purge qui ne sait pas s'arreter est pire qu'une purge absente.
 *
 * Le faux client enregistre chaque requete; le filtre de date est le seul
 * discriminant "dans la fenetre / hors fenetre", donc on le verifie en valeur.
 */
interface Appel {
  table: string;
  kind: 'delete';
  options: unknown;
  filtres: [string, string, string][];
}

let appels: Appel[];
let reponse: { count: number | null; error: unknown };
let rpcReponses: Record<string, { data: unknown; error: unknown }>;
let rpcAppels: { nom: string; args: unknown }[];
let authAppels: { id: string; attrs: unknown }[];
let authErreur: unknown;
let tablesTouchees: string[];

function fausseBase(): SupabaseClient {
  return {
    from: (table: string) => {
      tablesTouchees.push(table);
      return {
        delete: (options: unknown) => {
          const appel: Appel = { table, kind: 'delete', options, filtres: [] };
          appels.push(appel);
          const chaine = {
            neq: (c: string, v: string) => {
              appel.filtres.push(['neq', c, v]);
              return chaine;
            },
            lt: (c: string, v: string) => {
              appel.filtres.push(['lt', c, v]);
              return Promise.resolve(reponse);
            },
          };
          return chaine;
        },
      };
    },
    rpc: (nom: string, args: unknown) => {
      rpcAppels.push({ nom, args });
      return Promise.resolve(rpcReponses[nom] ?? { data: null, error: null });
    },
    auth: {
      admin: {
        updateUserById: (id: string, attrs: unknown) => {
          authAppels.push({ id, attrs });
          return Promise.resolve({ error: authErreur });
        },
      },
    },
  } as unknown as SupabaseClient;
}

const MAINTENANT = new Date('2026-11-15T10:00:00.000Z');

describe('purges de conservation', () => {
  beforeEach(() => {
    appels = [];
    reponse = { count: 4, error: null };
    rpcReponses = {};
    rpcAppels = [];
    authAppels = [];
    authErreur = null;
    tablesTouchees = [];
  });

  it('invitations: seules les non acceptees, 30 jours apres expiration', async () => {
    const n = await createRetentionService(fausseBase()).purgerInvitationsPerimees(MAINTENANT);

    expect(n).toBe(4);
    const a = appels[0];
    expect(a.table).toBe('invitations');
    expect(a.options).toEqual({ count: 'exact' });
    // Temoin negatif: une invitation acceptee est exclue.
    expect(a.filtres).toContainEqual(['neq', 'status', 'accepted']);
    // 30 jours avant le 15 novembre = 16 octobre.
    expect(a.filtres).toContainEqual(['lt', 'expires_at', '2026-10-16T10:00:00.000Z']);
  });

  it('push: supprime sur last_used_at, 180 jours', async () => {
    await createRetentionService(fausseBase()).purgerAbonnementsPushInactifs(MAINTENANT);

    expect(appels[0].table).toBe('push_subscriptions');
    // 180 jours avant le 15 novembre 2026 = 19 mai 2026.
    expect(appels[0].filtres).toContainEqual(['lt', 'last_used_at', '2026-05-19T10:00:00.000Z']);
  });

  it('audit: les deux journaux, 365 jours, compte cumule', async () => {
    const n = await createRetentionService(fausseBase()).purgerJournauxAudit(MAINTENANT);

    expect(n).toBe(8);
    expect(appels.map((a) => a.table)).toEqual(['audit_log', 'platform_audit_log']);
    for (const a of appels) {
      expect(a.filtres).toContainEqual(['lt', 'created_at', '2025-11-15T10:00:00.000Z']);
    }
  });

  it('les durees par defaut sont celles annoncees', () => {
    expect(RETENTION).toMatchObject({
      guestDataDays: 90,
      sessionsDays: 90,
      invitationsAfterExpiryDays: 30,
      pushInactiveDays: 180,
      auditLogDays: 365,
      closedTenantAnonymizeDays: 30,
    });
  });

  it('une erreur de suppression est propagee', async () => {
    reponse = { count: null, error: { message: 'panne' } };
    await expect(
      createRetentionService(fausseBase()).purgerInvitationsPerimees(MAINTENANT),
    ).rejects.toEqual({ message: 'panne' });
  });

  it('jamais de purge sur payments, orders, stripe_events ni invoices', async () => {
    const service = createRetentionService(fausseBase());
    await service.purgerInvitationsPerimees(MAINTENANT);
    await service.purgerAbonnementsPushInactifs(MAINTENANT);
    await service.purgerJournauxAudit(MAINTENANT);
    await service.anonymiserRestaurantsFermes(MAINTENANT);

    for (const interdite of ['payments', 'orders', 'stripe_events', 'invoices']) {
      expect(tablesTouchees).not.toContain(interdite);
    }
    expect(appels.every((a) => a.kind === 'delete')).toBe(true);
  });

  describe('restaurants clos', () => {
    it('efface l adresse auth de chaque compte puis anonymise la base, meme date limite', async () => {
      rpcReponses.closed_tenant_auth_users = {
        data: [{ auth_user_id: 'u1' }, { auth_user_id: 'u2' }],
        error: null,
      };
      rpcReponses.anonymize_closed_tenants = { data: 2, error: null };

      const n = await createRetentionService(fausseBase()).anonymiserRestaurantsFermes(MAINTENANT);

      expect(n).toBe(2);
      expect(authAppels.map((a) => a.id)).toEqual(['u1', 'u2']);
      expect(authAppels[0].attrs).toEqual({
        email: 'anonymise-u1@anonymise.invalid',
        user_metadata: {},
      });
      // 30 jours avant le 15 novembre = 16 octobre; identique aux deux appels.
      const coupure = { p_cutoff: '2026-10-16T10:00:00.000Z' };
      expect(rpcAppels).toEqual([
        { nom: 'closed_tenant_auth_users', args: coupure },
        { nom: 'anonymize_closed_tenants', args: coupure },
      ]);
    });

    it('si l auth echoue, la base n est PAS anonymisee (reessai la nuit suivante)', async () => {
      rpcReponses.closed_tenant_auth_users = { data: [{ auth_user_id: 'u1' }], error: null };
      authErreur = { message: 'auth indisponible' };

      await expect(
        createRetentionService(fausseBase()).anonymiserRestaurantsFermes(MAINTENANT),
      ).rejects.toEqual({ message: 'auth indisponible' });
      expect(rpcAppels.map((r) => r.nom)).toEqual(['closed_tenant_auth_users']);
    });

    it('aucun restaurant du: zero, aucun compte touche', async () => {
      rpcReponses.closed_tenant_auth_users = { data: [], error: null };
      rpcReponses.anonymize_closed_tenants = { data: 0, error: null };

      const n = await createRetentionService(fausseBase()).anonymiserRestaurantsFermes(MAINTENANT);

      expect(n).toBe(0);
      expect(authAppels).toEqual([]);
    });
  });
});
