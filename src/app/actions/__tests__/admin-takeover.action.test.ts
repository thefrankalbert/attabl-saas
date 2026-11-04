import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Prise de controle de compte (constats ACT-14 / SVC-12).
 *
 * Chaine d'attaque reproduite ici: un owner/admin du tenant A obtient (ou
 * possede deja) une ligne admin_users pointant vers le compte auth d'une
 * victime qui appartient au tenant B (ou qui est super_admin), puis appelle
 * actionResetUserPassword / actionUpdateUserEmail. Ces deux actions touchent
 * le compte auth GLOBAL: l'invitant prend donc le controle du compte d'un
 * tiers, super_admin inclus.
 *
 * Les tests exigent:
 *  - un refus quand la cible possede une appartenance dans un AUTRE tenant;
 *  - un refus quand la cible est un compte plateforme (super_admin);
 *  - qu'un mot de passe ne soit JAMAIS fixe par un tiers: un lien de
 *    reinitialisation part a l'adresse du titulaire;
 *  - qu'un changement d'email ne soit JAMAIS auto-confirme.
 */

const mockGetAuthForTenant = vi.fn();
const mockSendPasswordResetEmail = vi.fn();

type MembershipRow = {
  tenant_id: string | null;
  role: string | null;
  is_super_admin: boolean | null;
  /** Retire par la plateforme (super-admin): la ligne n'ouvre plus aucun acces. */
  deleted_at?: string | null;
};

type TargetRow = { user_id: string; email: string; role: string } | null;

let membershipRows: MembershipRow[] = [];
let targetRow: TargetRow = null;

const updateUserById = vi.fn();
const generateLink = vi.fn();
const getUserById = vi.fn();
const adminUsersUpdate = vi.fn();

function buildAdminClient() {
  return {
    auth: {
      admin: {
        updateUserById: (...args: unknown[]) => updateUserById(...args),
        generateLink: (...args: unknown[]) => generateLink(...args),
        getUserById: (...args: unknown[]) => getUserById(...args),
      },
    },
    from: (table: string) => {
      if (table === 'admin_users') {
        return {
          select: (cols: string) => {
            // Garde de perimetre: liste TOUTES les appartenances du compte cible.
            if (cols.includes('is_super_admin')) {
              return {
                eq: () => Promise.resolve({ data: membershipRows, error: null }),
              };
            }
            // Lecture de la ligne cible, scopee au tenant de l'appelant.
            return {
              eq: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: targetRow, error: null }),
                  maybeSingle: () => Promise.resolve({ data: targetRow, error: null }),
                }),
              }),
            };
          },
          update: (payload: unknown) => {
            adminUsersUpdate(payload);
            return {
              eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
            };
          },
        };
      }
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { slug: 'resto-a' }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
        }),
        insert: () => Promise.resolve({ error: null }),
      };
    },
  };
}

let adminClient = buildAdminClient();

const resetLinkLimiterCheck = vi.fn();

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/lib/rate-limit', () => ({
  adminPasswordResetLinkLimiter: { check: (...args: unknown[]) => resetLinkLimiterCheck(...args) },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: (...args: unknown[]) => mockGetAuthForTenant(...args),
  AuthError: class AuthError extends Error {
    status = 403;
  },
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }));
vi.mock('@/services/audit.service', () => ({
  createAuditService: () => ({ log: vi.fn() }),
}));
vi.mock('@/services/email.service', () => ({
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}));

import { actionResetUserPassword, actionUpdateUserEmail } from '@/app/actions/admin';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const VICTIM_AUTH_ID = 'victim-auth-id';

function actorIsOwnerOfTenantA() {
  mockGetAuthForTenant.mockResolvedValue({
    user: { id: 'actor-auth-id', email: 'owner@resto-a.test' },
    role: 'owner',
    adminUserId: 'actor-admin-row',
    tenantId: TENANT_A,
    supabase: {},
  });
}

describe('prise de controle de compte via les actions admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminClient = buildAdminClient();
    membershipRows = [];
    targetRow = null;
    updateUserById.mockResolvedValue({ error: null });
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'hashed-token-123' } },
      error: null,
    });
    getUserById.mockResolvedValue({
      data: { user: { id: VICTIM_AUTH_ID, email: 'victime@autre-resto.test' } },
      error: null,
    });
    mockSendPasswordResetEmail.mockResolvedValue(true);
    resetLinkLimiterCheck.mockResolvedValue({ success: true });
  });

  describe('actionResetUserPassword', () => {
    // REFUTATION R2' du contre-audit LOT 4. Le lot precedent avait RELACHE ce
    // refus, au motif qu'"il ne subsiste que des appartenances consenties
    // depuis R1 ferme". C'est faux au moment ou le code part: la migration
    // n'est pas appliquee et AUCUNE remediation des lignes parasites deja
    // posees en production n'a ete livree - seulement un logger.info. Le
    // relachement augmentait donc ce qu'un attaquant deja installe peut faire a
    // sa victime (declencher a volonte des courriels de recuperation sur sa
    // boite reelle). Le garde redevient fail-closed, comme pour le changement
    // d'email. Le deni de service est traite autrement: la plateforme retire la
    // ligne parasite (test suivant).
    it('refuse (fail-closed) quand le compte cible appartient aussi a un AUTRE tenant', async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: VICTIM_AUTH_ID, email: 'equipier@resto-a.test', role: 'manager' };
      membershipRows = [
        { tenant_id: TENANT_A, role: 'manager', is_super_admin: false },
        { tenant_id: TENANT_B, role: 'owner', is_super_admin: false },
      ];

      const res = await actionResetUserPassword(TENANT_A, 'target-admin-row');

      expect(res.error).toBe('permissionDenied');
      expect(updateUserById).not.toHaveBeenCalled();
      expect(generateLink).not.toHaveBeenCalled();
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    // RESERVE S5' du contre-audit: le test du cas relache jouait une cible dont
    // l'adresse auth vivait DANS le tenant de l'appelant - la forme benigne. Le
    // scenario qui rend le relachement dangereux est l'inverse: la victime est
    // etrangere au tenant appelant, et c'est sa vraie boite qui recoit le
    // courriel. C'est ce cas qui est verrouille ici.
    it("refuse quand l'adresse auth de la cible est etrangere au tenant de l'appelant", async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: VICTIM_AUTH_ID, email: 'equipier@resto-a.test', role: 'manager' };
      membershipRows = [
        { tenant_id: TENANT_A, role: 'manager', is_super_admin: false },
        { tenant_id: TENANT_B, role: 'owner', is_super_admin: false },
      ];
      // La ligne du tenant A est le miroir pose par l'attaquant; le compte auth
      // reel de la victime porte l'adresse de SON restaurant.
      getUserById.mockResolvedValue({
        data: { user: { id: VICTIM_AUTH_ID, email: 'victime@autre-resto.test' } },
        error: null,
      });

      const res = await actionResetUserPassword(TENANT_A, 'target-admin-row');

      expect(res.error).toBe('permissionDenied');
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    // RECUPERATION sans l'attaquant (correctif R2' point 2): la ligne parasite
    // est retiree par la PLATEFORME (actionSoftDeleteAdminUser, console
    // super-admin, deja existante et auditee). Une appartenance soft-deleted
    // n'ouvre plus aucun acces (toutes les resolutions de session filtrent
    // `deleted_at is null`): elle ne doit donc plus geler le proprietaire
    // legitime.
    it('envoie le lien quand la ligne etrangere a ete retiree par la plateforme (soft-delete)', async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: VICTIM_AUTH_ID, email: 'equipier@resto-a.test', role: 'manager' };
      membershipRows = [
        { tenant_id: TENANT_A, role: 'manager', is_super_admin: false, deleted_at: null },
        {
          tenant_id: TENANT_B,
          role: 'owner',
          is_super_admin: false,
          deleted_at: '2026-11-04T10:00:00.000Z',
        },
      ];
      getUserById.mockResolvedValue({
        data: { user: { id: VICTIM_AUTH_ID, email: 'equipier@resto-a.test' } },
        error: null,
      });

      const res = await actionResetUserPassword(TENANT_A, 'target-admin-row');

      expect(res.success).toBe(true);
      expect(updateUserById).not.toHaveBeenCalled();
      const [sentTo] = mockSendPasswordResetEmail.mock.calls[0] as [string, { resetUrl: string }];
      expect(sentTo).toBe('equipier@resto-a.test');
    });

    // Un compte plateforme reste intouchable meme si sa ligne a ete retiree:
    // le soft-delete d'une appartenance super_admin ne doit pas ouvrir le
    // passage sur un compte d'operateur.
    it('refuse un compte plateforme meme quand sa ligne est soft-deleted', async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: VICTIM_AUTH_ID, email: 'platform@attabl.test', role: 'manager' };
      membershipRows = [
        {
          tenant_id: TENANT_A,
          role: 'manager',
          is_super_admin: true,
          deleted_at: '2026-11-04T10:00:00.000Z',
        },
      ];

      const res = await actionResetUserPassword(TENANT_A, 'target-admin-row');

      expect(res.error).toBe('permissionDenied');
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    // RESERVE R2' point 3: aucune limitation de debit n'existait sur cette
    // Server Action, alors que l'equivalent public /api/forgot-password est a
    // 3 par 10 minutes. La cle porte sur le COMPTE CIBLE: le prejudice est par
    // boite aux lettres, et un restaurant entier est derriere une seule IP.
    it('borne le debit sur le compte cible et refuse au-dela du quota', async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: 'local-auth-id', email: 'equipier@resto-a.test', role: 'manager' };
      membershipRows = [{ tenant_id: TENANT_A, role: 'manager', is_super_admin: false }];
      getUserById.mockResolvedValue({
        data: { user: { id: 'local-auth-id', email: 'equipier@resto-a.test' } },
        error: null,
      });
      // Trois envois dans la fenetre, puis refus du quatrieme.
      resetLinkLimiterCheck
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValue({ success: false });

      for (let i = 0; i < 3; i += 1) {
        const ok = await actionResetUserPassword(TENANT_A, 'target-admin-row');
        expect(ok.success).toBe(true);
      }

      const refus = await actionResetUserPassword(TENANT_A, 'target-admin-row');

      expect(refus.error).toBe('permissionDenied');
      expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(3);
      expect(resetLinkLimiterCheck).toHaveBeenCalledWith(`${TENANT_A}:target-admin-row`);
    });

    it('refuse quand le compte cible est un compte plateforme (super_admin)', async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: VICTIM_AUTH_ID, email: 'platform@attabl.test', role: 'manager' };
      membershipRows = [{ tenant_id: TENANT_A, role: 'manager', is_super_admin: true }];

      const res = await actionResetUserPassword(TENANT_A, 'target-admin-row');

      expect(res.error).toBe('permissionDenied');
      expect(updateUserById).not.toHaveBeenCalled();
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('refuse quand les appartenances du compte cible sont illisibles (fail-closed)', async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: VICTIM_AUTH_ID, email: 'equipier@resto-a.test', role: 'manager' };
      membershipRows = [];

      const res = await actionResetUserPassword(TENANT_A, 'target-admin-row');

      expect(res.error).toBe('permissionDenied');
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("ne fixe jamais le mot de passe d'autrui: envoie un lien de reinitialisation au titulaire", async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: 'local-auth-id', email: 'equipier@resto-a.test', role: 'manager' };
      membershipRows = [{ tenant_id: TENANT_A, role: 'manager', is_super_admin: false }];
      getUserById.mockResolvedValue({
        data: { user: { id: 'local-auth-id', email: 'equipier@resto-a.test' } },
        error: null,
      });

      const res = await actionResetUserPassword(TENANT_A, 'target-admin-row');

      expect(res.success).toBe(true);
      // Aucune ecriture directe du mot de passe sur le compte auth.
      expect(updateUserById).not.toHaveBeenCalled();
      expect(generateLink).toHaveBeenCalledWith({
        type: 'recovery',
        email: 'equipier@resto-a.test',
      });
      expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const [sentTo] = mockSendPasswordResetEmail.mock.calls[0] as [string, { resetUrl: string }];
      expect(sentTo).toBe('equipier@resto-a.test');
    });
  });

  describe('actionUpdateUserEmail', () => {
    it("refuse de changer l'email d'un compte appartenant a un autre tenant", async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: VICTIM_AUTH_ID, email: 'victime@autre-resto.test', role: 'manager' };
      membershipRows = [
        { tenant_id: TENANT_A, role: 'manager', is_super_admin: false },
        { tenant_id: TENANT_B, role: 'owner', is_super_admin: false },
      ];

      const res = await actionUpdateUserEmail(
        TENANT_A,
        'target-admin-row',
        'pirate@attaquant.test',
      );

      expect(res.error).toBe('permissionDenied');
      expect(updateUserById).not.toHaveBeenCalled();
      expect(adminUsersUpdate).not.toHaveBeenCalled();
    });

    it("refuse de changer l'email d'un compte plateforme (super_admin)", async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: VICTIM_AUTH_ID, email: 'platform@attabl.test', role: 'manager' };
      membershipRows = [{ tenant_id: TENANT_A, role: 'super_admin', is_super_admin: null }];

      const res = await actionUpdateUserEmail(
        TENANT_A,
        'target-admin-row',
        'pirate@attaquant.test',
      );

      expect(res.error).toBe('permissionDenied');
      expect(updateUserById).not.toHaveBeenCalled();
    });

    it("n'auto-confirme jamais la nouvelle adresse (pas de email_confirm)", async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: 'local-auth-id', email: 'equipier@resto-a.test', role: 'manager' };
      membershipRows = [{ tenant_id: TENANT_A, role: 'manager', is_super_admin: false }];

      const res = await actionUpdateUserEmail(TENANT_A, 'target-admin-row', 'nouveau@resto-a.test');

      expect(res.success).toBe(true);
      expect(updateUserById).toHaveBeenCalledTimes(1);
      const [, payload] = updateUserById.mock.calls[0] as [string, Record<string, unknown>];
      expect(payload.email).toBe('nouveau@resto-a.test');
      expect(payload).not.toHaveProperty('email_confirm');
    });
  });
});
