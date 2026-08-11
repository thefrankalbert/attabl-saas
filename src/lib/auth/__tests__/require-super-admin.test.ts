/**
 * Garde des operations "mode dieu" de la plateforme.
 *
 * C'est le controle le plus puissant du produit: il autorise a suspendre un
 * etablissement, bannir un utilisateur, supprimer des donnees qui ne sont pas
 * les siennes. Un proprietaire d'etablissement, meme legitime chez lui, n'y a
 * pas droit - seul l'operateur de la plateforme.
 *
 * Trois choses doivent tenir, et chacune a deja ete une faille ailleurs:
 * le droit se lit en BASE (jamais dans le jeton, que l'utilisateur edite),
 * une adhesion revoquee ou supprimee ne confere PLUS rien, et une panne de
 * lecture refuse au lieu d'accorder.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * Le client factice doit exister AVANT l'import du module teste, que Vitest
 * hisse en haut du fichier. `vi.hoisted` est le seul endroit ou le construire:
 * un `const` ordinaire serait encore dans sa zone morte quand la fabrique de
 * mock s'execute.
 *
 * Le mock resout la promesse sur `.is()`, dernier maillon de la chaine appelee
 * par le code teste. Un mock qui resoudrait des `.eq()` laisserait passer un
 * code ayant perdu ce filtre final - or c'est precisement lui qui exclut les
 * adhesions supprimees.
 */
const h = vi.hoisted(() => {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  const getUser = vi.fn();
  const etat = {
    /** Reponse de la lecture `admin_users`, posee par chaque test. */
    reponse: { data: [] as unknown, error: null as unknown },
    /** Filtres observes, pour verifier le perimetre de la requete. */
    filtres: [] as Array<{ methode: string; col: string; val: unknown }>,
  };
  const client = {
    auth: { getUser },
    from(table: string) {
      const builder = {
        select: () => builder,
        eq(col: string, val: unknown) {
          etat.filtres.push({ methode: 'eq', col: `${table}.${col}`, val });
          return builder;
        },
        is(col: string, val: unknown) {
          etat.filtres.push({ methode: 'is', col: `${table}.${col}`, val });
          return Promise.resolve(etat.reponse);
        },
      };
      return builder;
    },
  };
  return { logger, getUser, etat, client };
});

vi.mock('@/lib/logger', () => ({ logger: h.logger }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import { isSuperAdmin, requireSuperAdmin } from '../require-super-admin';
import { AuthError } from '../get-session';

const { logger, getUser, etat, client } = h;
type ClientSupabase = Parameters<typeof isSuperAdmin>[0];
const supabase = client as unknown as ClientSupabase;

beforeEach(() => {
  vi.clearAllMocks();
  etat.filtres = [];
  etat.reponse = { data: [], error: null };
  getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'op@attabl.com' } }, error: null });
});

describe('isSuperAdmin', () => {
  it('accorde le droit sur le drapeau is_super_admin', async () => {
    etat.reponse = { data: [{ is_super_admin: true, role: 'owner' }], error: null };

    expect(await isSuperAdmin(supabase, 'u1')).toBe(true);
  });

  it('accorde le droit sur le role historique super_admin', async () => {
    // Les comptes anterieurs au drapeau portent encore le role. Les couper
    // enfermerait l'operateur dehors.
    etat.reponse = { data: [{ is_super_admin: false, role: 'super_admin' }], error: null };

    expect(await isSuperAdmin(supabase, 'u1')).toBe(true);
  });

  it('accorde le droit si UNE SEULE adhesion le porte', async () => {
    etat.reponse = {
      data: [
        { is_super_admin: false, role: 'manager' },
        { is_super_admin: false, role: 'server' },
        { is_super_admin: true, role: 'owner' },
      ],
      error: null,
    };

    expect(await isSuperAdmin(supabase, 'u1')).toBe(true);
  });

  it('refuse un proprietaire d etablissement ordinaire', async () => {
    // Le cas qui compte: owner chez lui, aucun droit sur la plateforme.
    etat.reponse = { data: [{ is_super_admin: false, role: 'owner' }], error: null };

    expect(await isSuperAdmin(supabase, 'u1')).toBe(false);
  });

  it('refuse un utilisateur sans aucune adhesion', async () => {
    etat.reponse = { data: [], error: null };

    expect(await isSuperAdmin(supabase, 'u1')).toBe(false);
  });

  it('refuse quand la lecture echoue, et le journalise', async () => {
    // Une panne de base ne doit pas ouvrir le mode dieu. Fermeture par defaut.
    etat.reponse = { data: null, error: { message: 'connexion perdue' } };

    expect(await isSuperAdmin(supabase, 'u1')).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  it('refuse quand la lecture ne rend rien du tout', async () => {
    etat.reponse = { data: null, error: null };

    expect(await isSuperAdmin(supabase, 'u1')).toBe(false);
  });

  it('ignore une valeur is_super_admin qui n est pas exactement true', async () => {
    // Comparaison stricte volontaire: une chaine "true" ou un 1 venus d'une
    // colonne mal typee ne doivent pas conferer le droit.
    etat.reponse = { data: [{ is_super_admin: 'true', role: 'owner' }], error: null };

    expect(await isSuperAdmin(supabase, 'u1')).toBe(false);
  });

  it('ne lit que les adhesions VIVANTES de cet utilisateur', async () => {
    // Sans `is_active` et `deleted_at`, un operateur revoque garderait le mode
    // dieu: c'est exactement ce que ces deux filtres empechent.
    etat.reponse = { data: [{ is_super_admin: true, role: 'owner' }], error: null };

    await isSuperAdmin(supabase, 'u1');

    expect(etat.filtres).toContainEqual({ methode: 'eq', col: 'admin_users.user_id', val: 'u1' });
    expect(etat.filtres).toContainEqual({ methode: 'eq', col: 'admin_users.is_active', val: true });
    expect(etat.filtres).toContainEqual({
      methode: 'is',
      col: 'admin_users.deleted_at',
      val: null,
    });
  });
});

describe('requireSuperAdmin', () => {
  it('rend l utilisateur et le client a un super admin', async () => {
    etat.reponse = { data: [{ is_super_admin: true, role: 'owner' }], error: null };

    const ctx = await requireSuperAdmin();

    expect(ctx.user).toEqual({ id: 'u1', email: 'op@attabl.com' });
    expect(ctx.supabase).toBe(client);
  });

  it('rejette en 401 sans session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(requireSuperAdmin()).rejects.toMatchObject({
      name: 'AuthError',
      status: 401,
    });
  });

  it('rejette en 401 quand la verification du jeton echoue', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'jeton expire' } });

    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(AuthError);
  });

  it('rejette en 403 un utilisateur authentifie non super admin', async () => {
    // 403 et non 401: la distinction compte pour l'appelant, qui ne doit pas
    // renvoyer vers la page de connexion quelqu'un de deja connecte.
    etat.reponse = { data: [{ is_super_admin: false, role: 'owner' }], error: null };

    await expect(requireSuperAdmin()).rejects.toMatchObject({ status: 403 });
  });

  it('journalise la tentative refusee', async () => {
    etat.reponse = { data: [{ is_super_admin: false, role: 'owner' }], error: null };

    await expect(requireSuperAdmin()).rejects.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Non-super-admin'),
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('accepte un compte sans adresse email, sans planter', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    etat.reponse = { data: [{ is_super_admin: true, role: 'owner' }], error: null };

    const ctx = await requireSuperAdmin();

    expect(ctx.user.email).toBe('');
  });
});
