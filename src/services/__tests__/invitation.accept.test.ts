/**
 * Acceptation d'une invitation et listing des invitations en attente.
 *
 * Accepter une invitation, c'est DONNER a quelqu'un l'acces aux donnees d'un
 * restaurant: ses commandes, son chiffre d'affaires, son personnel. Le lien
 * circule par email, donc il peut etre transfere, garde des mois, reclique
 * deux fois, ou lu par quelqu'un d'autre. Chacun de ces cas doit se refermer.
 *
 * Ces deux methodes n'avaient aucun test. Elles sont ici couvertes sur les
 * scenarios qui font vraiment perdre le controle d'un compte:
 * jeton expire, jeton deja consomme, double clic, et course entre la
 * verification et l'ecriture.
 *
 * Le fichier voisin `invitation.service.test.ts` couvre la creation, la
 * validation et le renvoi. Il a son propre harnais de simulation, volontairement
 * laisse tel quel: celui d'ici doit gerer `rpc`, les notifications et la
 * pagination, que l'autre ne connait pas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInvitationService } from '../invitation.service';
import { ServiceError } from '../errors';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

/** Invitation valide par defaut: en attente, expire dans une heure. */
function invitationValide(surcharge: Record<string, unknown> = {}) {
  return {
    id: 'inv-001',
    tenant_id: 'tenant-du-resto',
    email: 'nouveau@example.com',
    role: 'staff',
    custom_permissions: null,
    invited_by: 'owner-1',
    token: 'jeton-valide',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    status: 'pending',
    created_at: new Date().toISOString(),
    accepted_at: null,
    ...surcharge,
  };
}

interface Options {
  /** Ligne rendue par la recherche du jeton (null = introuvable). */
  invitation?: Record<string, unknown> | null;
  /** Membre deja rattache a cet email (null = compte a creer). */
  membreExistant?: { user_id: string; email: string } | null;
  /** Erreur renvoyee par la creation du compte d'authentification. */
  erreurCreationCompte?: { message: string } | null;
  /** Erreur renvoyee par la procedure d'adhesion en base. */
  erreurRpc?: { message: string } | null;
  /** Valeur rendue par la procedure d'adhesion. */
  resultatRpc?: unknown;
  /** Erreur a l'insertion de la notification d'equipe. */
  erreurNotification?: { message: string } | null;
  /** Lignes rendues par le listing des invitations en attente. */
  lignes?: Array<Record<string, unknown>>;
  /** Erreur du listing. */
  erreurListing?: { message: string } | null;
  /** Total renvoye par le comptage exact. */
  total?: number;
  /** Erreur au marquage des invitations expirees. */
  erreurExpiration?: { message: string } | null;
}

/**
 * Journal des appels observes. C'est lui qui permet de verifier ce que le
 * service a REELLEMENT demande a la base - notamment qu'il n'a PAS cree de
 * compte quand il devait refuser.
 */
interface Journal {
  creationCompte: Array<Record<string, unknown>>;
  rpc: Array<{ nom: string; args: Record<string, unknown> }>;
  notifications: Array<Record<string, unknown>>;
  filtresListing: Array<{ col: string; val: unknown }>;
  plage: Array<{ de: number; a: number }>;
  expires: string[][];
  misAJour: Array<Record<string, unknown>>;
}

function creerSimulation(options: Options = {}) {
  const journal: Journal = {
    creationCompte: [],
    rpc: [],
    notifications: [],
    filtresListing: [],
    plage: [],
    expires: [],
    misAJour: [],
  };

  const invitation = options.invitation === undefined ? invitationValide() : options.invitation;

  const supabase = {
    auth: {
      admin: {
        createUser: vi.fn(async (payload: Record<string, unknown>) => {
          journal.creationCompte.push(payload);
          if (options.erreurCreationCompte) {
            return { data: { user: null }, error: options.erreurCreationCompte };
          }
          return { data: { user: { id: 'utilisateur-cree' } }, error: null };
        }),
      },
    },

    rpc: vi.fn(async (nom: string, args: Record<string, unknown>) => {
      journal.rpc.push({ nom, args });
      if (options.erreurRpc) return { data: null, error: options.erreurRpc };
      return {
        data: options.resultatRpc === undefined ? { tenantSlug: 'mon-resto' } : options.resultatRpc,
        error: null,
      };
    }),

    from(table: string) {
      if (table === 'invitations') {
        return {
          // Deux formes de lecture partagent ce constructeur: la recherche par
          // jeton (`.eq().eq().single()`) et le listing pagine
          // (`.eq().eq().order().range()`). Le meme objet sert les deux.
          select: (_colonnes: string, opts?: { count?: string }) => {
            const chaine: Record<string, unknown> = {};
            chaine.eq = (col: string, val: unknown) => {
              journal.filtresListing.push({ col, val });
              return chaine;
            };
            chaine.single = async () =>
              invitation
                ? { data: invitation, error: null }
                : { data: null, error: { code: 'PGRST116', message: 'introuvable' } };
            chaine.order = () => chaine;
            chaine.range = async (de: number, a: number) => {
              journal.plage.push({ de, a });
              return {
                data: options.erreurListing ? null : (options.lignes ?? []),
                error: options.erreurListing ?? null,
                count: opts?.count === 'exact' ? (options.total ?? 0) : null,
              };
            };
            return chaine;
          },
          update: (payload: Record<string, unknown>) => {
            journal.misAJour.push(payload);
            return {
              eq: async () => ({ error: options.erreurExpiration ?? null }),
              in: async (_col: string, ids: string[]) => {
                journal.expires.push(ids);
                return { error: options.erreurExpiration ?? null };
              },
            };
          },
        };
      }

      if (table === 'admin_users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: options.membreExistant ?? null, error: null }),
            }),
          }),
        };
      }

      if (table === 'notifications') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            journal.notifications.push(payload);
            return { error: options.erreurNotification ?? null };
          },
        };
      }

      throw new Error(`table non simulee: ${table}`);
    },
  };

  const service = createInvitationService(
    supabase as unknown as Parameters<typeof createInvitationService>[0],
  );
  return { service, journal, supabase };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('acceptInvitation - refus', () => {
  it('refuse un jeton expire SANS creer de compte ni donner d acces', async () => {
    // Le scenario le plus courant: le lien dort dans une boite mail et
    // ressort des semaines plus tard. Le refus ne suffit pas - il faut
    // qu'aucune trace d'acces n'ait ete creee au passage.
    const { service, journal } = creerSimulation({
      invitation: invitationValide({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    });

    await expect(service.acceptInvitation({ token: 'jeton-vieux' })).rejects.toThrow(
      'Cette invitation a expire',
    );
    expect(journal.creationCompte).toHaveLength(0);
    expect(journal.rpc).toHaveLength(0);
  });

  it('marque l invitation expiree en base au passage', async () => {
    const { service, journal } = creerSimulation({
      invitation: invitationValide({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    });

    await expect(service.acceptInvitation({ token: 'jeton-vieux' })).rejects.toThrow();

    expect(journal.misAJour).toContainEqual({ status: 'expired' });
  });

  it('refuse un jeton inconnu ou deja consomme', async () => {
    // Meme message pour les deux cas, volontairement: distinguer "inconnu" de
    // "deja utilise" dirait a un attaquant quels jetons ont existe.
    const { service, journal } = creerSimulation({ invitation: null });

    await expect(service.acceptInvitation({ token: 'jeton-invente' })).rejects.toThrow(
      'Invitation introuvable ou deja utilisee',
    );
    expect(journal.creationCompte).toHaveLength(0);
    expect(journal.rpc).toHaveLength(0);
  });

  it('refuse un nouveau compte sans nom ni mot de passe', async () => {
    const { service, journal } = creerSimulation({ membreExistant: null });

    await expect(service.acceptInvitation({ token: 'jeton-valide' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(journal.creationCompte).toHaveLength(0);
  });

  it('refuse quand le mot de passe manque, meme avec le nom', async () => {
    const { service } = creerSimulation({ membreExistant: null });

    await expect(
      service.acceptInvitation({ token: 'jeton-valide', fullName: 'Awa' }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it('remonte une erreur de creation de compte sans donner l acces', async () => {
    const { service, journal } = creerSimulation({
      membreExistant: null,
      erreurCreationCompte: { message: 'mot de passe trop faible' },
    });

    await expect(
      service.acceptInvitation({ token: 'jeton-valide', fullName: 'Awa', password: 'court' }),
    ).rejects.toThrow('mot de passe trop faible');
    expect(journal.rpc).toHaveLength(0);
  });
});

describe('acceptInvitation - course entre la verification et l ecriture', () => {
  it('traduit une expiration detectee en base en refus lisible', async () => {
    // La verification a dit "valide", puis l'invitation a expire avant
    // l'ecriture. C'est la base qui tranche en dernier, et elle a raison.
    const { service } = creerSimulation({
      membreExistant: { user_id: 'u-1', email: 'nouveau@example.com' },
      erreurRpc: { message: 'INVITATION_EXPIRED: trop tard' },
    });

    await expect(service.acceptInvitation({ token: 'jeton-valide' })).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Cette invitation a expire',
    });
  });

  it('refuse un rejeu quand l invitation a ete consommee entre-temps', async () => {
    // Double clic sur le lien, ou deux personnes qui ouvrent le meme email.
    // Le second passage doit repartir les mains vides, pas creer une seconde
    // adhesion.
    const { service } = creerSimulation({
      membreExistant: { user_id: 'u-1', email: 'nouveau@example.com' },
      erreurRpc: { message: 'INVITATION_NOT_FOUND: deja consommee' },
    });

    await expect(service.acceptInvitation({ token: 'jeton-valide' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('remonte toute autre panne d adhesion en erreur interne', async () => {
    const { service } = creerSimulation({
      membreExistant: { user_id: 'u-1', email: 'nouveau@example.com' },
      erreurRpc: { message: 'deadlock detected' },
    });

    await expect(service.acceptInvitation({ token: 'jeton-valide' })).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });

  it('reste lisible quand la panne n a pas de message', async () => {
    const { service } = creerSimulation({
      membreExistant: { user_id: 'u-1', email: 'nouveau@example.com' },
      erreurRpc: { message: '' },
    });

    await expect(service.acceptInvitation({ token: 'jeton-valide' })).rejects.toThrow(
      'Erreur inconnue',
    );
  });
});

describe('acceptInvitation - chemin nominal', () => {
  it('rattache un membre deja connu sans creer de second compte', async () => {
    // Quelqu'un qui travaille deja dans un autre restaurant du reseau: on
    // reutilise son identite, on ne lui fabrique pas un doublon.
    const { service, journal } = creerSimulation({
      membreExistant: { user_id: 'utilisateur-existant', email: 'nouveau@example.com' },
    });

    const res = await service.acceptInvitation({ token: 'jeton-valide' });

    expect(res).toEqual({ tenantSlug: 'mon-resto' });
    expect(journal.creationCompte).toHaveLength(0);
    expect(journal.rpc[0].args.p_user_id).toBe('utilisateur-existant');
  });

  it('cree le compte pour un nouvel arrivant, avec email deja confirme', async () => {
    // L'email est confirme d'office: l'invitation EST la preuve que l'adresse
    // appartient bien a la personne, on ne lui redemande pas de la valider.
    const { service, journal } = creerSimulation({ membreExistant: null });

    await service.acceptInvitation({
      token: 'jeton-valide',
      fullName: 'Awa Traore',
      password: 'motdepasse-solide',
    });

    expect(journal.creationCompte[0]).toMatchObject({
      email: 'nouveau@example.com',
      email_confirm: true,
      user_metadata: { full_name: 'Awa Traore' },
    });
    expect(journal.rpc[0].args.p_user_id).toBe('utilisateur-cree');
  });

  it('utilise l identifiant relu en base, jamais celui fourni par l appelant', async () => {
    // Point de securite central: l'adhesion porte sur l'invitation retrouvee
    // via le jeton. Un identifiant d'invitation qui viendrait du client
    // permettrait de se greffer sur le restaurant de quelqu'un d'autre.
    const { service, journal } = creerSimulation({
      invitation: invitationValide({ id: 'inv-reelle', tenant_id: 'tenant-reel' }),
      membreExistant: { user_id: 'u-1', email: 'nouveau@example.com' },
    });

    await service.acceptInvitation({ token: 'jeton-valide' });

    expect(journal.rpc[0].nom).toBe('accept_invitation_membership');
    expect(journal.rpc[0].args.p_invitation_id).toBe('inv-reelle');
  });

  it('retombe sur l email quand aucun nom n est fourni', async () => {
    const { service, journal } = creerSimulation({
      membreExistant: { user_id: 'u-1', email: 'nouveau@example.com' },
    });

    await service.acceptInvitation({ token: 'jeton-valide' });

    expect(journal.rpc[0].args.p_full_name).toBe('nouveau@example.com');
  });

  it('previent l equipe du restaurant concerne, et de lui seul', async () => {
    const { service, journal } = creerSimulation({
      invitation: invitationValide({ tenant_id: 'tenant-du-resto' }),
      membreExistant: { user_id: 'u-1', email: 'nouveau@example.com' },
    });

    await service.acceptInvitation({ token: 'jeton-valide', fullName: 'Awa' });

    expect(journal.notifications[0]).toMatchObject({
      tenant_id: 'tenant-du-resto',
      user_id: null,
      type: 'success',
    });
    expect(journal.notifications[0].body).toContain('Awa');
  });

  it('n annule PAS l adhesion si la notification echoue', async () => {
    // Une notification ratee ne doit jamais renvoyer un nouvel employe vers
    // une page d'erreur alors qu'il est bel et bien rattache.
    const { service } = creerSimulation({
      membreExistant: { user_id: 'u-1', email: 'nouveau@example.com' },
      erreurNotification: { message: 'table pleine' },
    });

    await expect(service.acceptInvitation({ token: 'jeton-valide' })).resolves.toEqual({
      tenantSlug: 'mon-resto',
    });
  });

  it('rend une chaine vide plutot que undefined si la base ne donne pas de slug', async () => {
    const { service } = creerSimulation({
      membreExistant: { user_id: 'u-1', email: 'nouveau@example.com' },
      resultatRpc: null,
    });

    await expect(service.acceptInvitation({ token: 'jeton-valide' })).resolves.toEqual({
      tenantSlug: '',
    });
  });
});

describe('getPendingInvitations', () => {
  it('ne lit que les invitations en attente du restaurant demande', async () => {
    const { service, journal } = creerSimulation({ lignes: [], total: 0 });

    await service.getPendingInvitations('tenant-du-resto');

    expect(journal.filtresListing).toContainEqual({ col: 'tenant_id', val: 'tenant-du-resto' });
    expect(journal.filtresListing).toContainEqual({ col: 'status', val: 'pending' });
  });

  it('pagine par 25 par defaut', async () => {
    const { service, journal } = creerSimulation({ lignes: [], total: 0 });

    await service.getPendingInvitations('tenant-du-resto');

    expect(journal.plage).toEqual([{ de: 0, a: 24 }]);
  });

  it('calcule la bonne fenetre pour une page demandee', async () => {
    const { service, journal } = creerSimulation({ lignes: [], total: 0 });

    await service.getPendingInvitations('tenant-du-resto', { page: 3, pageSize: 10 });

    expect(journal.plage).toEqual([{ de: 20, a: 29 }]);
  });

  it('ecarte les invitations perimees et les marque en base', async () => {
    // Une invitation perimee restait affichee comme "en attente": on croyait
    // avoir invite quelqu'un qui ne pouvait plus entrer.
    const perimee = invitationValide({
      id: 'inv-perimee',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const vivante = invitationValide({ id: 'inv-vivante' });
    const { service, journal } = creerSimulation({ lignes: [perimee, vivante], total: 2 });

    const res = await service.getPendingInvitations('tenant-du-resto');

    expect(res.invitations.map((i) => i.id)).toEqual(['inv-vivante']);
    expect(journal.expires).toEqual([['inv-perimee']]);
  });

  it('ne touche pas la base quand rien n est perime', async () => {
    const { service, journal } = creerSimulation({ lignes: [invitationValide()], total: 1 });

    await service.getPendingInvitations('tenant-du-resto');

    expect(journal.expires).toHaveLength(0);
  });

  it('rend quand meme la liste si le marquage des perimees echoue', async () => {
    // Le nettoyage est opportuniste: son echec ne doit pas priver le gerant de
    // sa liste.
    const perimee = invitationValide({
      id: 'inv-perimee',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const { service } = creerSimulation({
      lignes: [perimee, invitationValide({ id: 'inv-vivante' })],
      total: 2,
      erreurExpiration: { message: 'verrou indisponible' },
    });

    const res = await service.getPendingInvitations('tenant-du-resto');

    expect(res.invitations.map((i) => i.id)).toEqual(['inv-vivante']);
  });

  it('rend le total exact du comptage, pas la taille de la page', async () => {
    const { service } = creerSimulation({ lignes: [invitationValide()], total: 87 });

    const res = await service.getPendingInvitations('tenant-du-resto', { pageSize: 1 });

    expect(res.total).toBe(87);
  });

  it('remonte une panne de lecture en erreur interne', async () => {
    const { service } = creerSimulation({ erreurListing: { message: 'connexion perdue' } });

    await expect(service.getPendingInvitations('tenant-du-resto')).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });
});
