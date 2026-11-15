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
  kind: 'delete' | 'update';
  options: unknown;
  filtres: [string, string, string][];
}

let appels: Appel[];
let reponse: { count: number | null; error: unknown };
let rpcReponses: Record<string, { data: unknown; error: unknown }>;
let rpcAppels: { nom: string; args: unknown }[];
let authAppels: { id: string; soft: unknown }[];
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
            or: (expression: string) => {
              appel.filtres.push(['or', expression, '']);
              return chaine;
            },
            lt: (c: string, v: string) => {
              appel.filtres.push(['lt', c, v]);
              return Promise.resolve(reponse);
            },
          };
          return chaine;
        },
        update: (payload: unknown, options: unknown) => {
          const appel: Appel = { table, kind: 'update', options, filtres: [] };
          appel.filtres.push(['set', JSON.stringify(payload), '']);
          appels.push(appel);
          const chaine = {
            lt: (c: string, v: string) => {
              appel.filtres.push(['lt', c, v]);
              return chaine;
            },
            neq: (c: string, v: string) => {
              appel.filtres.push(['neq', c, v]);
              return Promise.resolve(reponse);
            },
            not: (c: string, op: string, v: unknown) => {
              appel.filtres.push(['not', c, `${op}:${String(v)}`]);
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
        deleteUser: (id: string, soft: unknown) => {
          authAppels.push({ id, soft });
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
    expect(a.filtres).toContainEqual(['or', 'status.is.null,status.neq.accepted', '']);
    // 30 jours avant le 15 novembre = 16 octobre.
    expect(a.filtres).toContainEqual(['lt', 'expires_at', '2026-10-16T10:00:00.000Z']);
  });

  it('push: supprime sur last_used_at, 180 jours', async () => {
    await createRetentionService(fausseBase()).purgerAbonnementsPushInactifs(MAINTENANT);

    expect(appels[0].table).toBe('push_subscriptions');
    // 180 jours avant le 15 novembre 2026 = 19 mai 2026.
    expect(appels[0].filtres).toContainEqual(['lt', 'last_used_at', '2026-05-19T10:00:00.000Z']);
  });

  it('audit: la fonction SQL pseudonymise le financier, le journal plateforme est supprime', async () => {
    rpcReponses.purge_audit_logs = {
      data: [{ deleted_count: 5, pseudonymized_count: 2 }],
      error: null,
    };

    const r = await createRetentionService(fausseBase()).purgerJournauxAudit(MAINTENANT);

    // 5 supprimes par la fonction + 4 du journal de plateforme.
    expect(r).toEqual({ supprimes: 9, pseudonymises: 2 });
    expect(rpcAppels).toEqual([
      { nom: 'purge_audit_logs', args: { p_cutoff: '2025-11-15T10:00:00.000Z' } },
    ]);
    // Le journal des restaurants n'est JAMAIS supprime en SQL cote client: seul
    // le journal de plateforme l'est ici (temoin negatif).
    expect(appels.map((a) => a.table)).toEqual(['platform_audit_log']);
  });

  it('notes d articles: effacees, jamais supprimees, apres 90 jours', async () => {
    const n = await createRetentionService(fausseBase()).effacerNotesArticlesAnciennes(MAINTENANT);

    expect(n).toBe(4);
    const a = appels[0];
    expect(a.table).toBe('order_items');
    expect(a.kind).toBe('update');
    expect(a.filtres).toContainEqual(['set', '{"customer_notes":null}', '']);
    expect(a.filtres).toContainEqual(['lt', 'created_at', '2026-08-17T10:00:00.000Z']);
    expect(a.filtres).toContainEqual(['not', 'customer_notes', 'is:null']);
  });

  it('annotations de commande: texte remplace (jamais supprime), 90 jours, hors deja efface', async () => {
    const n = await createRetentionService(fausseBase()).effacerNotesCommandesAnciennes(MAINTENANT);

    expect(n).toBe(4);
    const a = appels[0];
    expect(a.table).toBe('order_notes');
    expect(a.kind).toBe('update');
    expect(a.filtres).toContainEqual(['set', '{"note":"Note effacee"}', '']);
    expect(a.filtres).toContainEqual(['lt', 'created_at', '2026-08-17T10:00:00.000Z']);
    expect(a.filtres).toContainEqual(['neq', 'note', 'Note effacee']);
  });

  it('sessions: lues sur RETENTION.sessionsDays', async () => {
    await createRetentionService(fausseBase()).purgerSessionsAnciennes(MAINTENANT);
    expect(appels[0].table).toBe('user_sessions');
    expect(appels[0].filtres).toContainEqual(['lt', 'created_at', '2026-08-17T10:00:00.000Z']);
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
    rpcReponses.purge_audit_logs = {
      data: [{ deleted_count: 0, pseudonymized_count: 0 }],
      error: null,
    };
    await service.purgerJournauxAudit(MAINTENANT);
    await service.anonymiserRestaurantsFermes(MAINTENANT);

    for (const interdite of ['payments', 'orders', 'stripe_events', 'invoices']) {
      expect(tablesTouchees).not.toContain(interdite);
    }
    // Aucune suppression ne vise une table comptable.
    expect(appels.filter((a) => a.kind === 'delete').every((a) => !a.table.includes('pay'))).toBe(
      true,
    );
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
      // Suppression LOGIQUE: identites OAuth retirees, ligne gardee pour les cles
      // etrangeres (admin_users, audit_log, commandes).
      expect(authAppels.every((a) => a.soft === true)).toBe(true);
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

    it('un compte deja supprime (404) n arrete pas la purge', async () => {
      rpcReponses.closed_tenant_auth_users = { data: [{ auth_user_id: 'u1' }], error: null };
      rpcReponses.anonymize_closed_tenants = { data: 1, error: null };
      authErreur = { status: 404, message: 'User not found' };

      const n = await createRetentionService(fausseBase()).anonymiserRestaurantsFermes(MAINTENANT);
      expect(n).toBe(1);
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
