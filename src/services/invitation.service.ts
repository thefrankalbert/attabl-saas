import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import type { Invitation } from '@/types/invitation.types';

interface CreateInvitationInput {
  tenantId: string;
  email: string;
  role: string;
  invitedBy: string;
  customPermissions?: Record<string, boolean>;
}

interface AcceptInvitationInput {
  token: string;
  fullName?: string;
  password?: string;
  /**
   * Email de la session authentifiee qui accepte, verifie cote serveur par
   * `auth.getUser()` dans la route. Jamais fourni par le client. Exige quand
   * l'adresse invitee possede deja un compte (voir acceptInvitation).
   */
  authenticatedEmail?: string;
  /**
   * Identifiant du compte auth de cette meme session (`auth.getUser().id`),
   * lui aussi verifie cote serveur et jamais fourni par le client.
   *
   * SECURITE (refutation R1' du contre-audit LOT 4): c'est CE compte qui est
   * enrole, et plus le `user_id` lu dans `admin_users` - colonne miroir qu'un
   * owner peut faire pointer vers une adresse arbitraire
   * (`actionUpdateUserEmail` ecrit le miroir avant que le compte auth soit
   * renomme). Verifier le consentement sur l'invitation et rattacher un compte
   * designe par le miroir, c'etait raisonner sur deux objets differents.
   */
  authenticatedUserId?: string;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// Reduced from 72h to 24h per security audit - shorter window limits exposure
// if the token leaks via browser history, CDN logs, or Referer headers.
const TOKEN_EXPIRY_HOURS = 24;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function getExpiresAt(): string {
  const date = new Date();
  date.setHours(date.getHours() + TOKEN_EXPIRY_HOURS);
  return date.toISOString();
}

export interface InvitationService {
  createInvitation(input: CreateInvitationInput): Promise<Invitation>;
  validateToken(token: string): Promise<Invitation>;
  acceptInvitation(input: AcceptInvitationInput): Promise<{ tenantSlug: string }>;
  cancelInvitation(invitationId: string): Promise<void>;
  resendInvitation(invitationId: string): Promise<Invitation>;
  getPendingInvitations(
    tenantId: string,
    options?: { page?: number; pageSize?: number },
  ): Promise<{ invitations: Invitation[]; total: number }>;
}

export function createInvitationService(supabase: SupabaseClient): InvitationService {
  return {
    async createInvitation(input: CreateInvitationInput): Promise<Invitation> {
      // SECURITE (constat SVC-12, prise de controle de compte). Il y avait ici
      // une branche "le compte existe deja -> on l'ajoute DIRECTEMENT dans
      // admin_users", sans jeton ni consentement du titulaire. Elle donnait a
      // tout owner/admin, en ne connaissant que l'email d'une personne (souvent
      // public: c'est le contact du restaurant), une ligne admin_users pointant
      // vers le compte auth de cette personne - super_admin inclus. Il s'en
      // servait ensuite via actionResetUserPassword / actionUpdateUserEmail,
      // qui agissent sur le compte auth GLOBAL, pour en prendre le controle.
      //
      // Desormais il n'existe plus qu'UN seul chemin: une invitation avec
      // jeton, envoyee a l'adresse du titulaire, que lui seul peut accepter
      // (POST /api/invitations/accept -> acceptInvitation, qui relie le compte
      // existant au tenant). Effet de bord voulu: la reponse est identique que
      // l'email existe ou non, donc elle ne permet plus d'enumerer les comptes.

      // Reject a duplicate pending invitation for the same (tenant, email): the
      // token UNIQUE constraint does not prevent multiple pending rows for one
      // email, which clutters the pending list and confuses the invitee about
      // which link is valid. To re-send, use the resend action (fresh token).
      const { data: existingPending } = await supabase
        .from('invitations')
        .select('id')
        .eq('tenant_id', input.tenantId)
        .eq('email', input.email)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingPending) {
        throw new ServiceError(
          'Une invitation est deja en attente pour cet email. Renvoyez-la ou annulez-la avant d en creer une nouvelle.',
          'VALIDATION',
        );
      }

      // New user - create invitation with token
      const token = generateToken();
      const expiresAt = getExpiresAt();

      const { data: invitation, error } = await supabase
        .from('invitations')
        .insert({
          tenant_id: input.tenantId,
          email: input.email,
          role: input.role,
          custom_permissions: input.customPermissions || null,
          invited_by: input.invitedBy,
          token,
          expires_at: expiresAt,
          status: 'pending',
        })
        .select(
          'id, tenant_id, email, role, custom_permissions, invited_by, token, expires_at, status, created_at, accepted_at',
        )
        .single();

      if (error || !invitation) {
        throw new ServiceError(
          `Erreur creation invitation: ${error?.message || 'Donnees manquantes'}`,
          'INTERNAL',
          error,
        );
      }

      return invitation as Invitation;
    },

    async validateToken(token: string): Promise<Invitation> {
      const { data: invitation, error } = await supabase
        .from('invitations')
        .select('*, tenants(name, logo_url, slug)')
        .eq('token', token)
        .eq('status', 'pending')
        .single();

      if (error || !invitation) {
        throw new ServiceError('Invitation introuvable ou deja utilisee', 'NOT_FOUND');
      }

      if (new Date(invitation.expires_at) < new Date()) {
        // Best-effort cleanup: the throw below already rejects the token for this
        // request; a failed update only leaves the row 'pending' until next listing.
        const { error: expireError } = await supabase
          .from('invitations')
          .update({ status: 'expired' })
          .eq('id', invitation.id);
        if (expireError) {
          logger.warn('validateToken: failed to mark invitation expired', {
            invitationId: invitation.id,
            error: expireError,
          });
        }
        throw new ServiceError('Cette invitation a expire', 'VALIDATION');
      }

      return invitation as Invitation;
    },

    async acceptInvitation(input: AcceptInvitationInput): Promise<{ tenantSlug: string }> {
      const invitation = await this.validateToken(input.token);

      let userId: string;

      // Resolution du compte existant, insensible a la casse. `.eq()` est
      // sensible a la casse en Postgres: une invitation "Victime@X.com" ne
      // retrouvait pas un compte enregistre "victime@x.com", et le flux
      // partait alors creer un compte qui existe deja. On essaie les deux
      // ecritures plutot qu'un `.ilike()`, dont les jokers % et _ seraient
      // interpretes et pourraient faire correspondre une AUTRE adresse.
      //
      // `.limit(1)` et PAS `.maybeSingle()` (reserve S1'): `admin_users` n'est
      // unique que par (tenant_id, email), donc un employe de deux restaurants
      // a DEUX lignes pour la meme adresse. `.maybeSingle()` renvoyait alors
      // PGRST116, l'erreur etait ignoree (seul `{ data }` etait destructure),
      // et l'employe partait sur la creation d'un compte qui existe deja: il ne
      // pouvait pas rejoindre un troisieme restaurant. L'erreur n'est plus
      // ignoree: une lecture impossible refuse (fail-closed) au lieu de
      // basculer silencieusement sur la creation de compte.
      //
      // Cette lecture ne decide plus de l'IDENTITE enrolee (voir R1'
      // ci-dessous): elle sert a choisir la branche et a reprendre le nom
      // d'affichage deja connu.
      const invitationEmail = normalizeEmail(invitation.email);
      const emailCandidates = Array.from(new Set([invitationEmail, invitation.email]));
      let existingAdminUser: { user_id: string; email: string; full_name: string | null } | null =
        null;
      for (const candidate of emailCandidates) {
        const { data, error: lookupError } = await supabase
          .from('admin_users')
          .select('user_id, email, full_name')
          .eq('email', candidate)
          .limit(1);
        if (lookupError) {
          logger.error('acceptInvitation: lecture des comptes existants impossible', {
            invitationId: invitation.id,
            tenantId: invitation.tenant_id,
            error: lookupError.message,
          });
          throw new ServiceError(
            'Impossible de verifier votre compte pour le moment. Reessayez plus tard.',
            'INTERNAL',
            lookupError,
          );
        }
        const row = (
          data as Array<{ user_id: string; email: string; full_name: string | null }>
        )[0];
        if (row) {
          existingAdminUser = row;
          break;
        }
      }

      // SECURITE (refutation R1' du contre-audit LOT 4). Une session dont
      // l'adresse VERIFIEE cote serveur est celle de l'invitation prouve deux
      // choses d'un coup: le consentement du titulaire, ET l'identite du compte
      // a rattacher. On enrole donc `authenticatedUserId`, jamais le `user_id`
      // du miroir. Effet de bord voulu: une personne dont le miroir a divergee
      // de son compte auth (adresse corrigee, confirmation jamais cliquee)
      // redevient invitable - avant, aucune invitation ne pouvait aboutir pour
      // elle, ni a son ancienne adresse ni a la nouvelle.
      const sessionProvesInvitee =
        !!input.authenticatedEmail &&
        !!input.authenticatedUserId &&
        normalizeEmail(input.authenticatedEmail) === invitationEmail;

      if (sessionProvesInvitee) {
        userId = input.authenticatedUserId as string;
      } else if (existingAdminUser) {
        // SECURITE (refutation R1 du contre-audit LOT 2). La possession du
        // jeton NE PROUVE PAS le consentement du titulaire: l'invitant lit le
        // jeton de l'invitation qu'il vient de creer (la politique RLS
        // "tenant_admins_can_view_invitations" lui ouvre la ligne entiere,
        // colonne token comprise, tant que la migration 20261104000000 n'est
        // pas appliquee). Sans ce controle, il acceptait a la place de la
        // victime et obtenait une ligne admin_users sur le compte auth d'un
        // tiers - exactement la faille que le premier correctif croyait avoir
        // fermee.
        //
        // Pour un compte qui existe DEJA, la seule preuve de consentement que
        // l'invitant ne detient pas est une session authentifiee portant
        // l'adresse invitee (traitee au-dessus). On arrive donc ici sans cette
        // preuve: refus. Le parcours d'un NOUVEL employe n'est pas touche
        // (branche else): aucun compte existant n'y est enrole, et le jeton
        // recu par email reste la preuve que l'adresse lui appartient.
        logger.warn('acceptInvitation: acceptation refusee, session du titulaire absente', {
          invitationId: invitation.id,
          tenantId: invitation.tenant_id,
          sessionPresente: Boolean(input.authenticatedEmail),
        });
        throw new ServiceError(
          'Pour rejoindre cette equipe, connectez-vous avec l adresse qui a recu l invitation.',
          'UNAUTHORIZED',
        );
      } else {
        if (!input.password || !input.fullName) {
          throw new ServiceError('Nom et mot de passe requis pour un nouveau compte', 'VALIDATION');
        }

        // HYPOTHESE NON MESUREE, et c'est TOUTE la securite de cette branche
        // (reserve S3 du contre-audit LOT 6). A lire comme une hypothese, pas
        // comme un fait: on suppose que GoTrue REFUSE `createUser` sur une
        // adresse deja enregistree. On arrive ici quand AUCUNE ligne miroir ne
        // porte l'adresse de l'invitation; si GoTrue renvoyait le compte
        // existant au lieu de refuser, `userId` ci-dessous serait le compte
        // d'un TIERS et la prise de controle serait de retour - sans session et
        // sans consentement. Les tests simulent ce refus; il n'est pas eprouve
        // contre une vraie base. A trancher par une mesure sur base jetable
        // (procedure: memoire projet `reference_test_db_locale_pieges`).
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: invitation.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { full_name: input.fullName },
        });

        if (authError || !authUser.user) {
          // SECURITE (reserve S2'): le message brut de GoTrue ("A user with
          // this email address has already been registered") etait restitue au
          // client par accept/route.ts. Sur un chemin atteignable avec le seul
          // jeton, c'est le meme oracle d'enumeration de comptes que le lot
          // precedent a ferme dans admin.ts. Message generique au client,
          // detail cote serveur (sans PII: ni l'adresse, ni le nom).
          logger.error('acceptInvitation: creation du compte auth refusee', {
            invitationId: invitation.id,
            tenantId: invitation.tenant_id,
            error: authError?.message,
          });
          throw new ServiceError(
            'Impossible de creer le compte pour le moment. Reessayez plus tard.',
            'INTERNAL',
            authError,
          );
        }

        userId = authUser.user.id;
      }

      // Nom affiche du membre (reserve S6'): a l'adhesion par session il n'y a
      // pas de formulaire, donc pas de `fullName`. Le nom est pourtant connu -
      // il est dans la ligne miroir qu'on vient de lire. Sans cela, le membre
      // apparaissait dans la liste d'equipe sous son adresse email.
      const memberName = input.fullName || existingAdminUser?.full_name || invitation.email;

      const { data, error } = await supabase.rpc('accept_invitation_membership', {
        p_invitation_id: invitation.id,
        p_user_id: userId,
        p_full_name: memberName,
      });

      if (error) {
        const msg = error.message ?? '';
        if (msg.includes('INVITATION_EXPIRED')) {
          throw new ServiceError('Cette invitation a expire', 'VALIDATION', error);
        }
        if (msg.includes('INVITATION_NOT_FOUND')) {
          throw new ServiceError('Invitation introuvable ou deja utilisee', 'NOT_FOUND', error);
        }
        // SECURITE (reserve S2'): meme oracle que ci-dessus - le texte complet
        // d'une violation de contrainte Postgres (nom d'index, colonne) etait
        // renvoye au client. Generique au client, detail cote serveur.
        logger.error('acceptInvitation: adhesion au restaurant refusee par la base', {
          invitationId: invitation.id,
          tenantId: invitation.tenant_id,
          error: msg,
        });
        throw new ServiceError(
          'Impossible de vous ajouter a ce restaurant pour le moment. Reessayez plus tard.',
          'INTERNAL',
          error,
        );
      }

      // Tell the team a new member joined. Non-fatal: a notification failure must
      // never block the invite acceptance itself. user_id null = tenant-wide.
      const { error: notifError } = await supabase.from('notifications').insert({
        tenant_id: invitation.tenant_id,
        user_id: null,
        type: 'success',
        title: 'Nouveau membre',
        body: `${memberName} a rejoint votre equipe.`,
        read: false,
      });
      if (notifError) {
        logger.warn('acceptInvitation: failed to insert member-joined notification', {
          tenantId: invitation.tenant_id,
          error: notifError,
        });
      }

      const row = data as { tenantSlug?: string } | null;
      return { tenantSlug: row?.tenantSlug ?? '' };
    },

    async cancelInvitation(invitationId: string): Promise<void> {
      const { error } = await supabase
        .from('invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId)
        .eq('status', 'pending');

      if (error) {
        throw new ServiceError(`Erreur annulation: ${error.message}`, 'INTERNAL', error);
      }
    },

    async resendInvitation(invitationId: string): Promise<Invitation> {
      const token = generateToken();
      const expiresAt = getExpiresAt();

      const { data: invitation, error } = await supabase
        .from('invitations')
        .update({ token, expires_at: expiresAt, status: 'pending' })
        .eq('id', invitationId)
        .eq('status', 'pending')
        .select(
          'id, tenant_id, email, role, custom_permissions, invited_by, token, expires_at, status, created_at, accepted_at',
        )
        .single();

      if (error || !invitation) {
        throw new ServiceError(
          `Erreur renvoi: ${error?.message || 'Invitation introuvable'}`,
          'INTERNAL',
          error,
        );
      }

      return invitation as Invitation;
    },

    async getPendingInvitations(
      tenantId: string,
      options?: { page?: number; pageSize?: number },
    ): Promise<{ invitations: Invitation[]; total: number }> {
      const page = options?.page ?? 1;
      const pageSize = options?.pageSize ?? 25;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('invitations')
        .select(
          'id, tenant_id, email, role, custom_permissions, invited_by, token, expires_at, status, created_at, accepted_at',
          { count: 'exact' },
        )
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        throw new ServiceError(`Erreur chargement: ${error.message}`, 'INTERNAL', error);
      }

      const now = new Date();
      const valid: Invitation[] = [];
      const expiredIds: string[] = [];

      for (const inv of (data || []) as Invitation[]) {
        if (new Date(inv.expires_at) < now) {
          expiredIds.push(inv.id);
        } else {
          valid.push(inv);
        }
      }

      if (expiredIds.length > 0) {
        const { error: expireError } = await supabase
          .from('invitations')
          .update({ status: 'expired' })
          .in('id', expiredIds);
        if (expireError) {
          logger.warn('getPendingInvitations: failed to mark invitations expired', {
            tenantId,
            expiredCount: expiredIds.length,
            error: expireError,
          });
        }
      }

      return { invitations: valid, total: count ?? valid.length };
    },
  };
}
