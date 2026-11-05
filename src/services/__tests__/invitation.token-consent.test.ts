/**
 * Consentement du titulaire a l'acceptation d'une invitation (refutation R1 du
 * contre-audit LOT 2, puis refutations R1' / S1' / S2' / S6' du contre-audit
 * LOT 4).
 *
 * Le premier correctif a supprime l'ajout direct dans admin_users et a declare
 * que seul le titulaire de l'adresse pouvait desormais accepter, "parce que lui
 * seul recoit le jeton". C'est faux: l'invitant lit le jeton de l'invitation
 * qu'il vient de creer (table invitations, colonne token, aucun REVOKE de
 * colonne avant la migration 20261104000000), et POST /api/invitations/accept
 * n'exigeait aucune session. Il pouvait donc accepter a la place de la victime
 * et obtenir la ligne admin_users sur le compte auth d'un tiers.
 *
 * Regle etablie ici: quand l'adresse invitee possede DEJA un compte, l'adhesion
 * exige une session authentifiee dont l'email correspond a celui de
 * l'invitation, ET c'est le compte auth DE CETTE SESSION qui est enrole - plus
 * jamais le `user_id` lu dans admin_users, colonne miroir qu'un owner peut
 * reecrire (refutation R1'). Le parcours d'un NOUVEL employe (aucun compte)
 * reste inchange: le jeton recu par email suffit, puisqu'aucun compte existant
 * n'est enrole.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInvitationService } from '../invitation.service';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const EMAIL_INVITE = 'victime@autre-resto.test';
/** Compte auth reellement connecte (auth.getUser().id, verifie cote serveur). */
const SESSION_USER_ID = 'compte-de-la-session';

interface LigneMiroir {
  user_id: string;
  email: string;
  full_name?: string | null;
}

interface Options {
  /** Membre deja rattache a cette adresse (null = aucun compte existant). */
  membreExistant?: LigneMiroir | null;
  /** Adresse exacte stockee dans admin_users (pour tester la casse). */
  emailEnBase?: string;
  /** Adresse de l'invitation. */
  emailInvitation?: string;
  /**
   * Plusieurs lignes portent la meme adresse (employe de deux restaurants:
   * admin_users n'est unique que par (tenant_id, email)). Supabase renvoie
   * alors PGRST116 a `.maybeSingle()` et la premiere ligne a `.limit(1)`.
   */
  lignesHomonymes?: LigneMiroir[];
  /** Panne de lecture du miroir (hors PGRST116). */
  erreurMiroir?: { code?: string; message: string };
  /** Erreur renvoyee par la creation du compte d'authentification. */
  erreurCreationCompte?: { message: string };
  /** Erreur renvoyee par la procedure d'adhesion en base. */
  erreurRpc?: { message: string };
}

interface Journal {
  creationCompte: Array<Record<string, unknown>>;
  rpc: Array<{ nom: string; args: Record<string, unknown> }>;
  /** Valeurs passees a .eq('email', ...) sur admin_users. */
  recherchesEmail: string[];
}

function creerSimulation(options: Options = {}) {
  const journal: Journal = { creationCompte: [], rpc: [], recherchesEmail: [] };
  const emailEnBase = options.emailEnBase ?? EMAIL_INVITE;

  const invitation = {
    id: 'inv-001',
    tenant_id: 'tenant-attaquant',
    email: options.emailInvitation ?? EMAIL_INVITE,
    role: 'admin',
    custom_permissions: null,
    invited_by: 'owner-attaquant',
    token: 'jeton-lu-par-l-invitant',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    status: 'pending',
    created_at: new Date().toISOString(),
    accepted_at: null,
  };

  /** Lignes du miroir qui correspondent a la valeur recherchee. */
  function lignesPour(valeur: string): LigneMiroir[] {
    if (options.lignesHomonymes) {
      return valeur === emailEnBase ? options.lignesHomonymes : [];
    }
    if (options.membreExistant !== undefined) {
      return options.membreExistant ? [options.membreExistant] : [];
    }
    return valeur === emailEnBase
      ? [{ user_id: 'compte-du-miroir-modifiable', email: emailEnBase }]
      : [];
  }

  const supabase = {
    auth: {
      admin: {
        createUser: vi.fn(async (payload: Record<string, unknown>) => {
          journal.creationCompte.push(payload);
          if (options.erreurCreationCompte) {
            return { data: { user: null }, error: options.erreurCreationCompte };
          }
          return { data: { user: { id: 'compte-cree' } }, error: null };
        }),
      },
    },

    rpc: vi.fn(async (nom: string, args: Record<string, unknown>) => {
      journal.rpc.push({ nom, args });
      if (options.erreurRpc) return { data: null, error: options.erreurRpc };
      return { data: { tenantSlug: 'resto-attaquant' }, error: null };
    }),

    from(table: string) {
      if (table === 'invitations') {
        return {
          select: () => {
            const chaine: Record<string, unknown> = {};
            chaine.eq = () => chaine;
            chaine.single = async () => ({ data: invitation, error: null });
            return chaine;
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }

      if (table === 'admin_users') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => {
              journal.recherchesEmail.push(val);
              const lignes = lignesPour(val);
              return {
                // Les deux formes de lecture, pour que le test pese sur le
                // comportement reel de Supabase et pas sur la forme du mock:
                // `.maybeSingle()` echoue en PGRST116 des qu'il y a plus d'une
                // ligne, `.limit(1)` en rend une.
                maybeSingle: async () => {
                  if (options.erreurMiroir) return { data: null, error: options.erreurMiroir };
                  if (lignes.length > 1) {
                    return {
                      data: null,
                      error: {
                        code: 'PGRST116',
                        message: 'JSON object requested, multiple (or no) rows returned',
                      },
                    };
                  }
                  return { data: lignes[0] ?? null, error: null };
                },
                limit: async () => {
                  if (options.erreurMiroir) return { data: null, error: options.erreurMiroir };
                  return { data: lignes.slice(0, 1), error: null };
                },
              };
            },
          }),
        };
      }

      if (table === 'notifications') {
        return { insert: async () => ({ error: null }) };
      }

      throw new Error(`table non simulee: ${table}`);
    },
  };

  const service = createInvitationService(
    supabase as unknown as Parameters<typeof createInvitationService>[0],
  );
  return { service, journal };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('acceptInvitation - consentement du titulaire d un compte existant', () => {
  it("refuse l'acceptation sans session: l'invitant qui a lu le jeton ne peut pas enroler le compte d'un tiers", async () => {
    const { service, journal } = creerSimulation();

    await expect(
      service.acceptInvitation({
        token: 'jeton-lu-par-l-invitant',
        fullName: 'peu importe',
        password: 'motdepasse-quelconque',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    // Aucune adhesion creee, aucun compte touche.
    expect(journal.rpc).toHaveLength(0);
    expect(journal.creationCompte).toHaveLength(0);
  });

  it('refuse quand la session connectee est celle de quelqu un d autre', async () => {
    const { service, journal } = creerSimulation();

    await expect(
      service.acceptInvitation({
        token: 'jeton-lu-par-l-invitant',
        authenticatedEmail: 'owner@resto-attaquant.test',
        authenticatedUserId: 'compte-de-l-attaquant',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(journal.rpc).toHaveLength(0);
  });

  it('accepte quand la session est celle de l adresse invitee, meme avec une casse differente', async () => {
    const { service, journal } = creerSimulation();

    const res = await service.acceptInvitation({
      token: 'jeton-lu-par-l-invitant',
      authenticatedEmail: 'Victime@Autre-Resto.TEST',
      authenticatedUserId: SESSION_USER_ID,
    });

    expect(res).toEqual({ tenantSlug: 'resto-attaquant' });
    expect(journal.rpc[0].args.p_user_id).toBe(SESSION_USER_ID);
  });

  // Invitation d'avant la normalisation (createInvitationSchema minusculise
  // desormais l'adresse): la ligne porte "Victime@Autre-Resto.TEST" alors que
  // le compte est enregistre en minuscules. Sans normalisation a la lecture,
  // le flux partait creer un compte qui existe deja.
  it('retrouve le compte existant quand l invitation porte une autre casse que admin_users', async () => {
    const { service, journal } = creerSimulation({
      emailInvitation: 'Victime@Autre-Resto.TEST',
      emailEnBase: 'victime@autre-resto.test',
    });

    const res = await service.acceptInvitation({
      token: 'jeton-lu-par-l-invitant',
      authenticatedEmail: 'victime@autre-resto.test',
      authenticatedUserId: SESSION_USER_ID,
    });

    expect(res.tenantSlug).toBe('resto-attaquant');
    expect(journal.creationCompte).toHaveLength(0);
    expect(journal.rpc[0].args.p_user_id).toBe(SESSION_USER_ID);
  });

  it('NON-REGRESSION: un nouvel employe sans compte rejoint toujours avec le seul jeton', async () => {
    const { service, journal } = creerSimulation({ membreExistant: null });

    const res = await service.acceptInvitation({
      token: 'jeton-lu-par-l-invitant',
      fullName: 'Awa Traore',
      password: 'motdepasse-solide',
    });

    expect(res.tenantSlug).toBe('resto-attaquant');
    expect(journal.creationCompte[0]).toMatchObject({ email: EMAIL_INVITE });
    expect(journal.rpc[0].args.p_user_id).toBe('compte-cree');
  });
});

/**
 * R1' - le compte enrole doit venir de la SESSION, pas du miroir admin_users.
 *
 * admin_users.email est un miroir applicatif modifiable: actionUpdateUserEmail
 * l'ecrit tout de suite alors que le compte auth n'est renomme qu'apres
 * confirmation du titulaire (admin.ts, PAS de email_confirm). Resoudre le
 * `user_id` par ce miroir, c'est donc verifier le consentement sur un objet et
 * enroler un autre.
 */
describe('acceptInvitation - l identite enrolee vient de la session (R1 prime)', () => {
  it('enrole le compte auth de la session, jamais le user_id lu dans le miroir admin_users', async () => {
    const { service, journal } = creerSimulation({
      membreExistant: { user_id: 'compte-du-miroir-modifiable', email: EMAIL_INVITE },
    });

    await service.acceptInvitation({
      token: 'jeton-lu-par-l-invitant',
      authenticatedEmail: EMAIL_INVITE,
      authenticatedUserId: SESSION_USER_ID,
    });

    expect(journal.rpc[0].args.p_user_id).toBe(SESSION_USER_ID);
    expect(journal.rpc[0].args.p_user_id).not.toBe('compte-du-miroir-modifiable');
  });

  it('accepte le titulaire connecte meme quand AUCUNE ligne miroir ne porte son adresse (fin du blocage integral)', async () => {
    // Cas mesure par R1' point 1: l'adresse du miroir a ete corrigee et le
    // titulaire n'a jamais confirme, donc une invitation a son adresse auth ne
    // trouve aucune ligne. Avant, le flux partait creer un compte qui existe
    // deja -> refus GoTrue -> erreur interne: la personne ne pouvait plus etre
    // invitee nulle part. La session prouve l'adresse, cela suffit.
    const { service, journal } = creerSimulation({ membreExistant: null });

    const res = await service.acceptInvitation({
      token: 'jeton-lu-par-l-invitant',
      authenticatedEmail: EMAIL_INVITE,
      authenticatedUserId: SESSION_USER_ID,
    });

    expect(res.tenantSlug).toBe('resto-attaquant');
    expect(journal.creationCompte).toHaveLength(0);
    expect(journal.rpc[0].args.p_user_id).toBe(SESSION_USER_ID);
  });
});

/**
 * S1' - admin_users n'est unique que par (tenant_id, email): un employe de deux
 * restaurants a DEUX lignes pour la meme adresse. `.maybeSingle()` renvoie
 * alors PGRST116, et l'erreur etait ignoree (seul `{ data }` etait destructure).
 */
describe('acceptInvitation - employe deja present dans deux restaurants (S1 prime)', () => {
  it('rejoint un troisieme restaurant malgre ses deux lignes admin_users homonymes', async () => {
    const { service, journal } = creerSimulation({
      lignesHomonymes: [
        { user_id: 'compte-de-l-employe', email: EMAIL_INVITE, full_name: 'Awa Traore' },
        { user_id: 'compte-de-l-employe', email: EMAIL_INVITE, full_name: 'Awa Traore' },
      ],
    });

    const res = await service.acceptInvitation({
      token: 'jeton-lu-par-l-invitant',
      authenticatedEmail: EMAIL_INVITE,
      authenticatedUserId: SESSION_USER_ID,
    });

    expect(res.tenantSlug).toBe('resto-attaquant');
    expect(journal.creationCompte).toHaveLength(0);
    expect(journal.rpc[0].args.p_user_id).toBe(SESSION_USER_ID);
  });

  it('sans session, deux lignes homonymes donnent un refus de consentement, pas une tentative de creation de compte', async () => {
    const { service, journal } = creerSimulation({
      lignesHomonymes: [
        { user_id: 'compte-de-l-employe', email: EMAIL_INVITE },
        { user_id: 'compte-de-l-employe', email: EMAIL_INVITE },
      ],
    });

    await expect(
      service.acceptInvitation({
        token: 'jeton-lu-par-l-invitant',
        fullName: 'Awa Traore',
        password: 'motdepasse-solide',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(journal.creationCompte).toHaveLength(0);
    expect(journal.rpc).toHaveLength(0);
  });

  it('une panne de lecture du miroir refuse (fail-closed) au lieu de creer un compte', async () => {
    const { service, journal } = creerSimulation({
      erreurMiroir: { message: 'connexion perdue' },
    });

    await expect(
      service.acceptInvitation({
        token: 'jeton-lu-par-l-invitant',
        fullName: 'Awa Traore',
        password: 'motdepasse-solide',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL' });

    expect(journal.creationCompte).toHaveLength(0);
    expect(journal.rpc).toHaveLength(0);
  });
});

/**
 * S2' - le message brut de GoTrue / Postgres etait renvoye au client par
 * accept/route.ts, sur un chemin atteignable avec le seul jeton. C'est le meme
 * oracle d'enumeration que le lot precedent a ferme dans admin.ts.
 */
describe('acceptInvitation - aucun detail de base renvoye au client (S2 prime)', () => {
  it("ne repete pas le message GoTrue 'already been registered' au client", async () => {
    const { service } = creerSimulation({
      membreExistant: null,
      erreurCreationCompte: {
        message: 'A user with this email address has already been registered',
      },
    });

    const promesse = service.acceptInvitation({
      token: 'jeton-lu-par-l-invitant',
      fullName: 'Awa Traore',
      password: 'motdepasse-solide',
    });

    await expect(promesse).rejects.toMatchObject({ code: 'INTERNAL' });
    await expect(promesse).rejects.not.toThrow(/already been registered/);
    expect(logger.error).toHaveBeenCalled();
  });

  it("ne repete pas le message Postgres de la procedure d'adhesion au client", async () => {
    const { service } = creerSimulation({
      erreurRpc: {
        message: 'duplicate key value violates unique constraint "idx_admin_users_email_tenant"',
      },
    });

    const promesse = service.acceptInvitation({
      token: 'jeton-lu-par-l-invitant',
      authenticatedEmail: EMAIL_INVITE,
      authenticatedUserId: SESSION_USER_ID,
    });

    await expect(promesse).rejects.toMatchObject({ code: 'INTERNAL' });
    await expect(promesse).rejects.not.toThrow(/unique constraint/);
    expect(logger.error).toHaveBeenCalled();
  });
});

/**
 * S6' - a l'adhesion par session, `fullName` est absent: le membre apparaissait
 * sous son adresse email alors que son nom etait dans la ligne qui venait
 * d'etre lue.
 */
describe('acceptInvitation - nom affiche du membre (S6 prime)', () => {
  it('reprend le nom connu du miroir quand la session adhere sans formulaire', async () => {
    const { service, journal } = creerSimulation({
      membreExistant: {
        user_id: 'compte-du-miroir-modifiable',
        email: EMAIL_INVITE,
        full_name: 'Awa Traore',
      },
    });

    await service.acceptInvitation({
      token: 'jeton-lu-par-l-invitant',
      authenticatedEmail: EMAIL_INVITE,
      authenticatedUserId: SESSION_USER_ID,
    });

    expect(journal.rpc[0].args.p_full_name).toBe('Awa Traore');
  });

  it('retombe sur l adresse quand le miroir ne connait aucun nom', async () => {
    const { service, journal } = creerSimulation({
      membreExistant: { user_id: 'compte-du-miroir-modifiable', email: EMAIL_INVITE },
    });

    await service.acceptInvitation({
      token: 'jeton-lu-par-l-invitant',
      authenticatedEmail: EMAIL_INVITE,
      authenticatedUserId: SESSION_USER_ID,
    });

    expect(journal.rpc[0].args.p_full_name).toBe(EMAIL_INVITE);
  });
});
