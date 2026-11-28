import { describe, it, expect, vi } from 'vitest';
import { createInvitationService, MAX_TEAM_ROWS, MEMBER_REMOVED } from '../invitation.service';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// B54 (revue ligne par ligne, lot B2b-2), decision du proprietaire du
// 2026-11-24: un membre RETIRE (ligne `admin_users` gardee avec `deleted_at`)
// n'est jamais reactive par une invitation. L'invitation est refusee avec un
// message clair, des la creation, et encore a l'acceptation (retrait survenu
// entre les deux). Avant: l'acceptation echouait toujours, sur l'index unique
// (tenant_id, email), avec un message technique generique.
//
// Base en memoire: `admin_users` avec ses filtres, et une procedure
// d'adhesion qui applique l'index unique (tenant_id, email) comme la vraie
// (INSERT sans ON CONFLICT, corps stocke en production).

interface Member {
  id: string;
  user_id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  deleted_at: string | null;
}

const TENANT = 'resto-1';
const EMAIL = 'awa@resto.test';

function invitation() {
  return {
    id: 'inv-1',
    tenant_id: TENANT,
    email: EMAIL,
    postes: ['waiter'],
    permission_overrides: null,
    invited_by: 'owner-1',
    token: 'jeton',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    status: 'pending',
    created_at: new Date().toISOString(),
    accepted_at: null,
  };
}

function db(
  members: Member[],
  opts: { retirerPendantAcceptation?: boolean; maxRows?: number } = {},
) {
  const journal = { rpc: 0, comptesCrees: 0, inserts: 0 };
  const supabase = {
    auth: {
      admin: {
        createUser: vi.fn(async () => {
          journal.comptesCrees += 1;
          return { data: { user: { id: 'nouveau-compte' } }, error: null };
        }),
      },
    },
    rpc: vi.fn(async (_nom: string, args: Record<string, unknown>) => {
      journal.rpc += 1;
      if (opts.retirerPendantAcceptation) {
        members.push({
          id: 'm-retire',
          user_id: 'autre',
          tenant_id: TENANT,
          email: EMAIL,
          full_name: null,
          is_active: false,
          deleted_at: new Date().toISOString(),
        });
      }
      if (members.some((m) => m.tenant_id === TENANT && m.email === EMAIL)) {
        return {
          data: null,
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "idx_admin_users_email_tenant"',
          },
        };
      }
      journal.inserts += 1;
      members.push({
        id: 'm-new',
        user_id: String(args.p_user_id),
        tenant_id: TENANT,
        email: EMAIL,
        full_name: null,
        is_active: true,
        deleted_at: null,
      });
      return { data: { tenantSlug: 'resto' }, error: null };
    }),
    from(table: string) {
      if (table === 'invitations') {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: invitation(), error: null }),
          insert: () => ({
            select: () => ({ single: async () => ({ data: invitation(), error: null }) }),
          }),
        };
        return q;
      }
      if (table === 'notifications') return { insert: async () => ({ error: null }) };
      // admin_users
      const preds: Array<(m: Member) => boolean> = [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: keyof Member, v: unknown) => (preds.push((m) => m[c] === v), q),
        in: (c: keyof Member, vs: unknown[]) => (preds.push((m) => vs.includes(m[c])), q),
        is: (c: keyof Member, v: unknown) => (preds.push((m) => m[c] === v), q),
        // Comme PostgREST: `count` = total exact, `data` = au plus `max_rows`
        // lignes (opts.maxRows simule un plafond serveur plus bas).
        limit: async (n: number) => {
          const all = members.filter((m) => preds.every((p) => p(m)));
          return {
            data: all.slice(0, Math.min(n, opts.maxRows ?? Infinity)),
            error: null,
            count: all.length,
          };
        },
      };
      return q;
    },
  };
  return {
    service: createInvitationService(
      supabase as unknown as Parameters<typeof createInvitationService>[0],
    ),
    journal,
  };
}

const retire: Member = {
  id: 'm-1',
  user_id: 'u-awa',
  tenant_id: TENANT,
  email: EMAIL,
  full_name: 'Awa',
  is_active: false,
  deleted_at: '2026-11-01T10:00:00Z',
};

describe('B54: membre retire, invitation refusee', () => {
  it('a la creation: refus clair avec le code MEMBER_REMOVED', async () => {
    const { service } = db([{ ...retire }]);
    await expect(service.assertNotAlreadyMember(TENANT, EMAIL)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { reason: MEMBER_REMOVED },
      message: expect.stringContaining('retiree'),
    });
  });

  it('a l acceptation: refus MEMBER_REMOVED, aucun compte cree, aucune adhesion', async () => {
    const members = [{ ...retire }];
    const { service, journal } = db(members);
    await expect(
      service.acceptInvitation({
        token: 'jeton',
        authenticatedEmail: EMAIL,
        authenticatedUserId: 'u-awa',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: MEMBER_REMOVED } });
    expect(journal.rpc).toBe(0);
    expect(journal.comptesCrees).toBe(0);
    // Rien ne reactive la ligne retiree.
    expect(members[0].deleted_at).not.toBeNull();
    expect(members[0].is_active).toBe(false);
  });

  it('retrait survenu entre la verification et l adhesion: meme refus, pas une erreur technique', async () => {
    const { service } = db([], { retirerPendantAcceptation: true });
    await expect(
      service.acceptInvitation({
        token: 'jeton',
        authenticatedEmail: EMAIL,
        authenticatedUserId: 'u-awa',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: MEMBER_REMOVED } });
  });

  it('temoin: une adresse jamais retiree s invite et accepte normalement', async () => {
    const members: Member[] = [];
    const { service, journal } = db(members);
    await expect(service.assertNotAlreadyMember(TENANT, EMAIL)).resolves.toBeUndefined();
    await expect(
      service.acceptInvitation({ token: 'jeton', fullName: 'Awa', password: 'Secret-123!' }),
    ).resolves.toEqual({ tenantSlug: 'resto' });
    expect(journal.inserts).toBe(1);
  });

  it('temoin: un membre simplement desactive (sans deleted_at) garde le refus "deja membre"', async () => {
    const { service } = db([{ ...retire, deleted_at: null }]);
    await expect(service.assertNotAlreadyMember(TENANT, EMAIL)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('fait deja partie'),
    });
  });

  // Contre-audit 1 (defaut 5): adresse retiree enregistree avec des majuscules.
  it('adresse retiree enregistree avec des majuscules: refus a la creation et a l acceptation', async () => {
    const members = [{ ...retire, email: 'Awa@Resto.Test' }];
    const { service, journal } = db(members);
    await expect(service.assertNotAlreadyMember(TENANT, '  awa@resto.test ')).rejects.toMatchObject(
      {
        details: { reason: MEMBER_REMOVED },
      },
    );
    await expect(
      service.acceptInvitation({
        token: 'jeton',
        authenticatedEmail: EMAIL,
        authenticatedUserId: 'u-awa',
      }),
    ).rejects.toMatchObject({ details: { reason: MEMBER_REMOVED } });
    expect(journal.rpc).toBe(0);
  });

  // Contre-audit 2: comparaison exacte sur l'adresse normalisee, aucun joker.
  it('un caractere joker dans l adresse ne fait pas correspondre une autre adresse', async () => {
    const { service } = db([{ ...retire, email: 'awaXresto.test' }]);
    for (const joker of ['awa_resto.test', 'awa%resto.test', 'awa*resto.test']) {
      await expect(service.assertNotAlreadyMember(TENANT, joker)).resolves.toBeUndefined();
    }
  });

  // Contre-audit 3 et 4: une lecture partielle (plafond serveur, ou limite
  // atteinte) est refusee au lieu de conclure "non retire".
  function equipe(n: number): Member[] {
    return Array.from({ length: n }, (_, i) => ({
      ...retire,
      id: `m-${i}`,
      email: `membre${i}@resto.test`,
      deleted_at: null,
    }));
  }

  it('reponse tronquee a 1000 pour un total superieur: refus INTERNAL, rien n est cree', async () => {
    const { service, journal } = db(equipe(1500), { maxRows: 1000 });
    await expect(service.assertNotAlreadyMember(TENANT, EMAIL)).rejects.toMatchObject({
      code: 'INTERNAL',
      message: expect.stringContaining('support ATTABL'),
    });
    await expect(
      service.acceptInvitation({ token: 'jeton', fullName: 'Awa', password: 'Secret-123!' }),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(journal.rpc).toBe(0);
    expect(journal.comptesCrees).toBe(0);
  });

  it('reponse tronquee SOUS la limite (plafond serveur inconnu, 800): refus INTERNAL', async () => {
    const { service } = db(equipe(900), { maxRows: 800 });
    await expect(service.assertNotAlreadyMember(TENANT, EMAIL)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });

  it('equipe a la limite demandee: refus INTERNAL', async () => {
    const { service } = db(equipe(MAX_TEAM_ROWS));
    await expect(service.assertNotAlreadyMember(TENANT, EMAIL)).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });

  it('temoin: reponse complete sous la limite: verifiee normalement', async () => {
    const { service } = db(equipe(MAX_TEAM_ROWS - 1), { maxRows: 1000 });
    await expect(service.assertNotAlreadyMember(TENANT, EMAIL)).resolves.toBeUndefined();
  });

  it('temoin: un membre retire d un AUTRE restaurant ne bloque rien ici', async () => {
    const { service } = db([{ ...retire, tenant_id: 'autre-resto' }]);
    await expect(service.assertNotAlreadyMember(TENANT, EMAIL)).resolves.toBeUndefined();
  });
});
