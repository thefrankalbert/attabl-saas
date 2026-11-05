/**
 * Tests du garde de permission des pages admin.
 *
 * C'est le fichier qui decide qui peut OUVRIR une page. Les endpoints d'ecriture
 * etaient deja proteges, pas les coquilles de page ni les donnees chargees cote
 * serveur avec elles: une page rendue pour un role qui n'y a pas droit fuit son
 * contenu avant meme qu'un bouton soit clique.
 *
 * Deux fonctions jumelles, aux echecs opposes et tous deux volontaires:
 * `requireAdminPermission` REDIRIGE (la page ne doit pas exister pour ce role),
 * `getAdminPermission` renvoie false (la page existe, le widget se cache).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const headersMock = vi.fn();
vi.mock('next/headers', () => ({ headers: () => headersMock() }));

const readTenantSlug = vi.fn();
vi.mock('@/lib/auth/tenant-header', () => ({ readTenantSlug: () => readTenantSlug() }));

const getTenant = vi.fn();
vi.mock('@/lib/cache', () => ({ getTenant: (s: string) => getTenant(s) }));

const hasPermission = vi.fn();
vi.mock('@/lib/permissions', () => ({
  hasPermission: (...a: unknown[]) => hasPermission(...a),
}));

/**
 * Les redirections de Next interrompent le flot. On les remplace par des jets
 * identifiables: sans cela, le code continuerait apres un `redirect()` et les
 * tests verifieraient un chemin qui n'existe pas en production.
 */
class RedirectLogin extends Error {}
class RedirectUnauthorized extends Error {}
vi.mock('../redirect-to-main', () => ({
  redirectToLogin: () => {
    throw new RedirectLogin('login');
  },
  redirectToUnauthorized: () => {
    throw new RedirectUnauthorized('unauthorized');
  },
}));

/** Reponses par table, consommees dans l'ordre d'appel. */
const reponses: Record<string, unknown[]> = {};
/** Filtres observes, pour verifier le scope des requetes. */
let filtres: Array<{ table: string; col: string; val: unknown }> = [];
const getUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from(table: string) {
      const builder = {
        select: () => builder,
        limit: () => builder,
        eq(col: string, val: unknown) {
          filtres.push({ table, col, val });
          return builder;
        },
        // `.is('deleted_at', null)` est le filtre qui ecarte les memberships
        // supprimes en douceur. On l'enregistre comme un `eq` pour pouvoir
        // l'assertionner: une garde qui l'oublierait rendrait leur ancien role
        // a des comptes supprimes.
        is(col: string, val: unknown) {
          filtres.push({ table, col, val });
          return builder;
        },
        single: async () => reponses[table]?.shift() ?? { data: null },
        maybeSingle: async () => reponses[table]?.shift() ?? { data: null },
      };
      return builder;
    },
  }),
}));

import { requireAdminPermission, getAdminPermission } from '../require-admin-permission';

beforeEach(() => {
  vi.clearAllMocks();
  filtres = [];
  for (const k of Object.keys(reponses)) delete reponses[k];
  headersMock.mockResolvedValue(new Headers());
  readTenantSlug.mockReturnValue({ slug: 'resto', trusted: true });
  getTenant.mockResolvedValue({ id: 'tenant-1' });
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  hasPermission.mockReturnValue(true);
});

describe('requireAdminPermission', () => {
  it('rend le tenant et le role a un membre autorise', async () => {
    reponses.admin_users = [{ data: { role: 'manager', custom_permissions: null } }];

    const ctx = await requireAdminPermission('resto', 'reports.view');

    expect(ctx).toEqual({ tenantId: 'tenant-1', role: 'manager' });
  });

  it('renvoie vers /unauthorized quand le tenant n existe pas', async () => {
    getTenant.mockResolvedValue(null);

    await expect(requireAdminPermission('inconnu', 'reports.view')).rejects.toBeInstanceOf(
      RedirectUnauthorized,
    );
  });

  it('renvoie vers /login sans session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(requireAdminPermission('resto', 'reports.view')).rejects.toBeInstanceOf(
      RedirectLogin,
    );
  });

  it('renvoie vers /login quand l authentification echoue', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('jeton invalide') });

    await expect(requireAdminPermission('resto', 'reports.view')).rejects.toBeInstanceOf(
      RedirectLogin,
    );
  });

  it('refuse un membre qui n a PAS la permission', async () => {
    // Le serveur qui tente d'ouvrir les rapports.
    reponses.admin_users = [{ data: { role: 'server', custom_permissions: null } }];
    hasPermission.mockReturnValue(false);

    await expect(requireAdminPermission('resto', 'reports.view')).rejects.toBeInstanceOf(
      RedirectUnauthorized,
    );
  });

  it('scope la recherche du membre sur l utilisateur ET le tenant', async () => {
    // Sans le filtre tenant_id, un membre d'un autre etablissement passerait.
    reponses.admin_users = [{ data: { role: 'owner', custom_permissions: null } }];

    await requireAdminPermission('resto', 'reports.view');

    expect(filtres).toContainEqual({ table: 'admin_users', col: 'user_id', val: 'u1' });
    expect(filtres).toContainEqual({ table: 'admin_users', col: 'tenant_id', val: 'tenant-1' });
  });

  it('accorde un acces owner a un super admin non membre', async () => {
    // La console plateforme doit atteindre n'importe quel etablissement.
    reponses.admin_users = [{ data: null }, { data: { id: 'sa-1' } }];

    const ctx = await requireAdminPermission('resto', 'reports.view');

    // On verifie le RESULTAT, pas l'appel interne a hasPermission. La garde
    // autorise un super-admin sans passer par elle, et c'est equivalent:
    // hasPermission renvoie true inconditionnellement pour le role `owner`
    // (short-circuit, permissions.ts). Asserter l'appel reviendrait a figer un
    // detail d'implementation au lieu de la regle.
    expect(ctx.role).toBe('owner');
  });

  it('ignore un membre suspendu et retombe sur la verification super admin', async () => {
    // Un membre suspendu (is_active=false) n'est PAS renvoye par la requete,
    // puisqu'elle filtre: la garde passe donc au test super-admin, qui echoue
    // ici. C'est ce qui empeche un compte desactive de garder son ancien role.
    reponses.admin_users = [{ data: null }, { data: null }];

    await expect(requireAdminPermission('resto', 'reports.view')).rejects.toBeInstanceOf(
      RedirectUnauthorized,
    );

    // La preuve que le refus vient bien des filtres et non d'autre chose.
    expect(filtres).toContainEqual({ table: 'admin_users', col: 'is_active', val: true });
    expect(filtres).toContainEqual({ table: 'admin_users', col: 'deleted_at', val: null });
  });

  it('filtre aussi les memberships morts sur le chemin super admin', async () => {
    reponses.admin_users = [{ data: null }, { data: null }];

    await expect(requireAdminPermission('resto', 'reports.view')).rejects.toBeInstanceOf(
      RedirectUnauthorized,
    );

    // Deux requetes, chacune filtrant is_active ET deleted_at: un super-admin
    // revoque ne doit pas garder un acces owner sur toute la plateforme.
    const actifs = filtres.filter((f) => f.table === 'admin_users' && f.col === 'is_active');
    const vivants = filtres.filter((f) => f.table === 'admin_users' && f.col === 'deleted_at');
    expect(actifs).toHaveLength(2);
    expect(vivants).toHaveLength(2);
  });

  it('accorde un acces owner a un membre marque super admin, quel que soit son role', async () => {
    // Ecart corrige par l'unification: le garde du middleware court-circuitait
    // sur is_super_admin de la ligne de membre, la garde de page l'ignorait. Un
    // super-admin ayant aussi une ligne a role faible etait donc autorise par
    // l'un et refuse par l'autre.
    reponses.admin_users = [
      { data: { role: 'waiter', custom_permissions: null, is_super_admin: true } },
    ];
    hasPermission.mockReturnValue(false);

    const ctx = await requireAdminPermission('resto', 'reports.view');

    expect(ctx.role).toBe('waiter');
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it('refuse un non-membre qui n est pas super admin', async () => {
    reponses.admin_users = [{ data: null }, { data: null }];

    await expect(requireAdminPermission('resto', 'reports.view')).rejects.toBeInstanceOf(
      RedirectUnauthorized,
    );
  });

  it('transmet la surcharge de role du tenant a hasPermission', async () => {
    // Un etablissement peut elargir ou restreindre un role: la surcharge doit
    // arriver jusqu'a la decision, sinon seule la matrice par defaut compte.
    reponses.admin_users = [{ data: { role: 'manager', custom_permissions: null } }];
    reponses.role_permissions = [{ data: { role: 'manager', permissions: ['reports.view'] } }];

    await requireAdminPermission('resto', 'reports.view');

    expect(hasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'manager' }),
      'reports.view',
      { permissions: ['reports.view'] },
    );
  });

  it('prefere le slug de l en-tete au parametre de route', async () => {
    // L'en-tete vient du middleware (source serveur); le parametre vient de
    // l'URL. En cas de desaccord, la source serveur fait foi.
    readTenantSlug.mockReturnValue({ slug: 'depuis-en-tete', trusted: true });
    reponses.admin_users = [{ data: { role: 'owner', custom_permissions: null } }];

    await requireAdminPermission('depuis-url', 'reports.view');

    expect(getTenant).toHaveBeenCalledWith('depuis-en-tete');
  });

  it('retombe sur le parametre de route quand l en-tete est vide', async () => {
    readTenantSlug.mockReturnValue({ slug: '', trusted: false });
    reponses.admin_users = [{ data: { role: 'owner', custom_permissions: null } }];

    await requireAdminPermission('depuis-url', 'reports.view');

    expect(getTenant).toHaveBeenCalledWith('depuis-url');
  });
});

describe('getAdminPermission', () => {
  it('renvoie true a un membre autorise', async () => {
    reponses.admin_users = [{ data: { role: 'manager', custom_permissions: null } }];

    expect(await getAdminPermission('resto', 'reports.view')).toBe(true);
  });

  it('renvoie false sans rediriger quand le tenant manque', async () => {
    // La difference avec requireAdminPermission: ici la page existe, seul le
    // widget se cache. Une redirection serait une regression visible.
    getTenant.mockResolvedValue(null);

    await expect(getAdminPermission('resto', 'reports.view')).resolves.toBe(false);
  });

  it('renvoie false sans session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    expect(await getAdminPermission('resto', 'reports.view')).toBe(false);
  });

  it('renvoie true a un super admin non membre', async () => {
    reponses.admin_users = [{ data: null }, { data: { id: 'sa-1' } }];

    expect(await getAdminPermission('resto', 'reports.view')).toBe(true);
  });

  it('renvoie false a un non-membre ordinaire', async () => {
    reponses.admin_users = [{ data: null }, { data: null }];

    expect(await getAdminPermission('resto', 'reports.view')).toBe(false);
  });

  it('renvoie false quand la permission est refusee', async () => {
    reponses.admin_users = [{ data: { role: 'server', custom_permissions: null } }];
    hasPermission.mockReturnValue(false);

    expect(await getAdminPermission('resto', 'reports.view')).toBe(false);
  });
});
