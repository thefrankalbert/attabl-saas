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

type TargetRow = {
  user_id: string;
  email: string;
  role: string;
  full_name?: string | null;
  /**
   * Retire par la plateforme. Le mock de lecture ci-dessous se comporte comme
   * Postgres: la ligne ne remonte PAS quand l'appelant a pose
   * `.is('deleted_at', null)`, et elle remonte quand il ne l'a pas pose. Sans
   * cela, un test ne pourrait pas distinguer les deux et n'aurait aucun pouvoir
   * discriminant (reserve S2 du contre-audit LOT 6).
   */
  deleted_at?: string | null;
} | null;

let membershipRows: MembershipRow[] = [];
let targetRow: TargetRow = null;

const updateUserById = vi.fn();
const generateLink = vi.fn();
const getUserById = vi.fn();
const adminUsersUpdate = vi.fn();
const adminUsersTargetIsFilter = vi.fn();
const adminRpc = vi.fn();

function buildAdminClient() {
  return {
    rpc: (...args: unknown[]) => adminRpc(...args),
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
            // `liveOnly` reproduit le filtre `.is('deleted_at', null)`.
            const targetTerminal = (liveOnly: boolean) => {
              const row = liveOnly && targetRow?.deleted_at != null ? null : targetRow;
              return {
                is: (column: string, value: unknown) => {
                  adminUsersTargetIsFilter(column, value);
                  return targetTerminal(column === 'deleted_at' && value === null);
                },
                single: () => Promise.resolve({ data: row, error: null }),
                maybeSingle: () => Promise.resolve({ data: row, error: null }),
              };
            };
            return {
              eq: () => ({
                eq: () => targetTerminal(false),
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
              maybeSingle: () => Promise.resolve({ data: { slug: 'resto-a' }, error: null }),
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
const resetLinkIpLimiterCheck = vi.fn();

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.7' })),
}));
vi.mock('@/lib/rate-limit', () => ({
  adminPasswordResetLinkLimiter: { check: (...args: unknown[]) => resetLinkLimiterCheck(...args) },
  adminPasswordResetLinkIpLimiter: {
    check: (...args: unknown[]) => resetLinkIpLimiterCheck(...args),
  },
  getClientIpFromHeaders: (h: Headers) => h.get('x-forwarded-for') ?? 'anonymous',
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

import {
  actionResetUserPassword,
  actionUpdateUserEmail,
  actionDeleteAdminUser,
  actionUpdateAdminUser,
} from '@/app/actions/admin';

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
    resetLinkIpLimiterCheck.mockResolvedValue({ success: true });
    adminRpc.mockResolvedValue({ data: false, error: null });
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

    // RESERVE S2 du contre-audit LOT 6. Le cas qui occupait cette place etait un
    // DOUBLON du precedent: ses `membershipRows` etaient identiques, le refus
    // tombait au garde de perimetre, et `getUserById` n'etait jamais atteint -
    // le mock d'adresse auth modifie n'avait donc aucun pouvoir sur le verdict.
    //
    // Le cas ci-dessous est, lui, discriminant: le garde AUTORISE (la cible n'a
    // qu'une appartenance, dans le tenant de l'appelant), donc `getUserById` est
    // bien atteint et c'est son resultat qui decide ou part le courriel. Il
    // verrouille l'invariant que le miroir `admin_users.email` ne doit JAMAIS
    // detourner le lien: un admin qui a reecrit ce miroir vers une adresse qu'il
    // controle (actionUpdateUserEmail ecrit le miroir meme quand GoTrue n'a pas
    // encore confirme le changement) ne doit pas recevoir le lien a la place du
    // titulaire. Mutation de controle: faire partir le courriel sur
    // `targetUser.email` au lieu de l'adresse auth fait tomber ce cas.
    //
    // Le controle "adresse auth hors du domaine du tenant" que R2' proposait est
    // ECARTE, avec sa raison: un tenant ATTABL n'a aucun domaine de courriel
    // verifie (le marche cible emploie des adresses gmail / yahoo pour ses
    // equipes), donc la regle refuserait la majorite des membres legitimes tout
    // en etant contournable par toute adresse du meme domaine grand public.
    it("envoie le lien a l'adresse du COMPTE AUTH, jamais au miroir admin_users", async () => {
      actorIsOwnerOfTenantA();
      // Miroir reecrit par l'attaquant vers une adresse qu'il controle.
      targetRow = { user_id: VICTIM_AUTH_ID, email: 'pirate@attaquant.test', role: 'manager' };
      membershipRows = [{ tenant_id: TENANT_A, role: 'manager', is_super_admin: false }];
      getUserById.mockResolvedValue({
        data: { user: { id: VICTIM_AUTH_ID, email: 'titulaire@resto-a.test' } },
        error: null,
      });

      const res = await actionResetUserPassword(TENANT_A, 'target-admin-row');

      expect(res.success).toBe(true);
      expect(generateLink).toHaveBeenCalledWith({
        type: 'recovery',
        email: 'titulaire@resto-a.test',
      });
      const [sentTo] = mockSendPasswordResetEmail.mock.calls[0] as [string, { resetUrl: string }];
      expect(sentTo).toBe('titulaire@resto-a.test');
      expect(sentTo).not.toBe('pirate@attaquant.test');
    });

    // RESERVE S1 du contre-audit LOT 6. Le limiteur par COMPTE CIBLE etait
    // consomme AVANT `checkTenantAdminPermissions`: un appelant qui n'avait
    // passe aucun controle d'identite brulait les 3 envois par heure d'un compte
    // precis (tout membre du tenant lit `admin_users.id` de ses collegues), et le
    // refus par quota devenait distinguable de la reponse "non authentifie" -
    // soit l'oracle d'activite de compte que le lot pretendait eviter.
    //
    // Troisieme voie retenue: un limiteur par IP en PREMIERE etape (la regle
    // 05-backend-api.md exige une limitation avant tout le reste, et une cle IP
    // n'est pas dirigeable contre un compte choisi), puis le limiteur par compte
    // cible APRES l'authentification.
    it('ne consomme pas le quota du compte cible quand l appelant n est pas authentifie', async () => {
      mockGetAuthForTenant.mockRejectedValue(
        Object.assign(new Error('non authentifie'), { status: 401 }),
      );
      targetRow = { user_id: 'local-auth-id', email: 'equipier@resto-a.test', role: 'manager' };
      membershipRows = [{ tenant_id: TENANT_A, role: 'manager', is_super_admin: false }];

      const res = await actionResetUserPassword(TENANT_A, 'target-admin-row');

      expect(res.error).toBeTruthy();
      expect(resetLinkIpLimiterCheck).toHaveBeenCalledWith('203.0.113.7');
      expect(resetLinkLimiterCheck).not.toHaveBeenCalled();
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('borne le debit par IP avant toute authentification', async () => {
      actorIsOwnerOfTenantA();
      targetRow = { user_id: 'local-auth-id', email: 'equipier@resto-a.test', role: 'manager' };
      membershipRows = [{ tenant_id: TENANT_A, role: 'manager', is_super_admin: false }];
      resetLinkIpLimiterCheck.mockResolvedValue({ success: false });

      const res = await actionResetUserPassword(TENANT_A, 'target-admin-row');

      expect(res.error).toBe('permissionDenied');
      expect(mockGetAuthForTenant).not.toHaveBeenCalled();
      expect(resetLinkLimiterCheck).not.toHaveBeenCalled();
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

    // REFUTATION R2 du contre-audit LOT 6. Le relachement "les lignes retirees
    // par la plateforme ne comptent plus" etait pose dans le garde PARTAGE, donc
    // il descendait aussi ici - alors que le rapport ne le motivait que par
    // l'envoi d'un courriel sur la boite du titulaire. Cette action-ci ECRIT
    // l'identite du compte auth: c'est la primitive de prise de controle (ACT-14),
    // elle ne doit compter AUCUNE ligne comme inexistante.
    //
    // La configuration ci-dessous n'est pas tordue: retirer un membre depuis la
    // console plateforme EST un soft-delete (platform-admin.service.ts,
    // `softDeleteAdminUser`). Un super_admin qui desinscrit un employe de son
    // restaurant d'origine donnait donc, sans le savoir, a l'admin de l'autre
    // tenant le droit de reecrire l'adresse du compte auth de cet employe.
    it("refuse meme quand l'appartenance etrangere a ete retiree par la plateforme", async () => {
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

      const res = await actionUpdateUserEmail(
        TENANT_A,
        'target-admin-row',
        'pirate@attaquant.test',
      );

      expect(res.error).toBe('permissionDenied');
      expect(updateUserById).not.toHaveBeenCalled();
      expect(adminUsersUpdate).not.toHaveBeenCalled();
    });

    // Meme invariant que `actionUpdateAdminUser` ci-dessous: une ligne retiree
    // par la plateforme est gelee pour le tenant. Ici l'action ECRIT l'identite
    // du compte auth, donc le gel compte double.
    it('refuse d agir sur une ligne retiree par la plateforme', async () => {
      actorIsOwnerOfTenantA();
      targetRow = {
        user_id: VICTIM_AUTH_ID,
        email: 'equipier@resto-a.test',
        role: 'manager',
        deleted_at: '2026-11-04T10:00:00.000Z',
      };
      membershipRows = [
        {
          tenant_id: TENANT_A,
          role: 'manager',
          is_super_admin: false,
          deleted_at: '2026-11-04T10:00:00.000Z',
        },
      ];

      const res = await actionUpdateUserEmail(
        TENANT_A,
        'target-admin-row',
        'pirate@attaquant.test',
      );

      expect(res.error).toBe('userNotFound');
      expect(updateUserById).not.toHaveBeenCalled();
      expect(adminUsersUpdate).not.toHaveBeenCalled();
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

  // CONSTAT C-3 (contre-audit d'ensemble). La suppression etait la seule des
  // trois actions a ne PAS appeler le garde de perimetre, alors qu'elle est la
  // plus destructrice: la RPC `delete_admin_user_atomic` (SECURITY DEFINER)
  // supprime la ligne, recompte les appartenances du compte auth, et si le
  // compte n'en a plus aucune elle fait `DELETE FROM auth.users` - une
  // destruction de compte globale, irreversible.
  //
  // Perimetre du garde pose ici, et ce qui est DELIBEREMENT laisse passer:
  //  - `platform_account` et `lookup_failed` REFUSENT. Un compte d'operateur de
  //    la plateforme n'est jamais gerable par un admin de tenant, et une lecture
  //    des appartenances qui echoue ne doit pas aboutir a une destruction
  //    (fail-closed).
  //  - `cross_tenant` est AUTORISE, et c'est mesure sur le corps de la RPC, pas
  //    suppose: quand la cible garde une appartenance vivante ailleurs,
  //    `remaining_count >= 1` et le compte auth est CONSERVE - seule la ligne du
  //    tenant appelant part. Refuser ce cas serait une regression pure: un
  //    proprietaire doit pouvoir retirer de SON equipe un employe partage avec
  //    un autre restaurant.
  describe('actionDeleteAdminUser', () => {
    it('refuse de supprimer un compte plateforme (super_admin)', async () => {
      actorIsOwnerOfTenantA();
      targetRow = {
        user_id: VICTIM_AUTH_ID,
        email: 'platform@attabl.test',
        full_name: 'Operateur',
        role: 'manager',
      };
      membershipRows = [{ tenant_id: TENANT_A, role: 'manager', is_super_admin: true }];

      const res = await actionDeleteAdminUser(TENANT_A, 'target-admin-row');

      expect(res.error).toBe('permissionDenied');
      expect(adminRpc).not.toHaveBeenCalled();
    });

    it('refuse (fail-closed) quand les appartenances du compte cible sont illisibles', async () => {
      actorIsOwnerOfTenantA();
      targetRow = {
        user_id: VICTIM_AUTH_ID,
        email: 'equipier@resto-a.test',
        full_name: 'Equipier',
        role: 'manager',
      };
      membershipRows = [];

      const res = await actionDeleteAdminUser(TENANT_A, 'target-admin-row');

      expect(res.error).toBe('permissionDenied');
      expect(adminRpc).not.toHaveBeenCalled();
    });

    it('NON-REGRESSION: supprime un membre de son propre tenant', async () => {
      actorIsOwnerOfTenantA();
      targetRow = {
        user_id: 'local-auth-id',
        email: 'equipier@resto-a.test',
        full_name: 'Equipier',
        role: 'manager',
      };
      membershipRows = [{ tenant_id: TENANT_A, role: 'manager', is_super_admin: false }];

      const res = await actionDeleteAdminUser(TENANT_A, 'target-admin-row');

      expect(res.success).toBe(true);
      expect(adminRpc).toHaveBeenCalledWith('delete_admin_user_atomic', {
        p_admin_user_id: 'target-admin-row',
        p_user_id: 'local-auth-id',
      });
    });

    it('NON-REGRESSION: retire de son equipe un employe partage avec un autre restaurant', async () => {
      actorIsOwnerOfTenantA();
      targetRow = {
        user_id: 'partage-auth-id',
        email: 'partage@resto-a.test',
        full_name: 'Employe partage',
        role: 'manager',
      };
      membershipRows = [
        { tenant_id: TENANT_A, role: 'manager', is_super_admin: false },
        { tenant_id: TENANT_B, role: 'manager', is_super_admin: false },
      ];

      const res = await actionDeleteAdminUser(TENANT_A, 'target-admin-row');

      expect(res.success).toBe(true);
      expect(adminRpc).toHaveBeenCalledTimes(1);
    });
  });
  // REFUTATION R2 (point 2.2) du contre-audit LOT 6, dernier morceau non livre.
  //
  // La remediation d'une ligne `admin_users` parasite est un soft-delete pose
  // par la PLATEFORME (`platform-admin.service.ts`, `softDeleteAdminUser`:
  // `deleted_at` + `is_active = false`). C'est ce retrait qui fait cesser le gel
  // du proprietaire legitime, donc c'est la seule sortie de la boucle d'attaque.
  //
  // Or `actionUpdateAdminUser` ne lisait NI n'ecrivait aucun filtre
  // `deleted_at`: un admin du tenant pouvait remettre `is_active = true` sur la
  // ligne que la plateforme venait de retirer, et annuler la remediation en une
  // requete. Un retrait plateforme n'etait pas un etat stable, alors que la
  // ligne a disparu de son interface (`admin/users/page.tsx` filtre
  // `deleted_at`): aucun geste legitime ne passe donc par ce chemin.
  //
  // La migration 20261105000000 pose la meme regle en base (policy RESTRICTIVE
  // `Platform-removed admin rows are frozen for tenants`), mais elle ne peut pas
  // suffire ici: cette action ecrit avec `createAdminClient()` (service_role),
  // qui IGNORE le RLS. Les deux couches sont necessaires, chacune sur son
  // chemin.
  //
  // La restauration reste possible, par le seul chemin prevu pour elle:
  // `restoreAdminUser`, dans la console plateforme, reservee au super_admin.
  describe('actionUpdateAdminUser - gel des lignes retirees par la plateforme', () => {
    it('refuse de reactiver une ligne retiree par la plateforme', async () => {
      actorIsOwnerOfTenantA();
      targetRow = {
        user_id: VICTIM_AUTH_ID,
        email: 'equipier@resto-a.test',
        role: 'manager',
        deleted_at: '2026-11-04T10:00:00.000Z',
      };

      const res = await actionUpdateAdminUser(TENANT_A, 'target-admin-row', { is_active: true });

      expect(res.error).toBe('userNotFound');
      expect(adminUsersTargetIsFilter).toHaveBeenCalledWith('deleted_at', null);
      expect(adminUsersUpdate).not.toHaveBeenCalled();
    });

    it('NON-REGRESSION: met toujours a jour une ligne vivante de son tenant', async () => {
      actorIsOwnerOfTenantA();
      targetRow = {
        user_id: 'local-auth-id',
        email: 'equipier@resto-a.test',
        role: 'manager',
        deleted_at: null,
      };

      const res = await actionUpdateAdminUser(TENANT_A, 'target-admin-row', {
        full_name: 'Nom mis a jour',
      });

      expect(res.success).toBe(true);
      expect(adminUsersUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
