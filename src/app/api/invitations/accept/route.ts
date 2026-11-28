import { isMfaSatisfied, MFA_REQUIRED_CODE, MFA_REQUIRED_MESSAGE } from '@/lib/auth/mfa-assurance';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { invitationAcceptLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createInvitationService } from '@/services/invitation.service';
import { createAuditService } from '@/services/audit.service';
import { acceptInvitationSchema } from '@/lib/validations/invitation.schema';
import { createPlanEnforcementService, isAdminSeat } from '@/services/plan-enforcement.service';
import type { Tenant } from '@/types/admin.types';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // Un corps qui n'est pas du JSON est une requete invalide (400), pas une
    // erreur serveur journalisee a chaque appel (revue L022, A25).
    const body: unknown = await request.json().catch(() => undefined);
    if (body === undefined) {
      return NextResponse.json({ error: 'Donnees invalides' }, { status: 400 });
    }

    // Rate-limit per token+IP, not per IP alone: scoping the budget to a single
    // invitation prevents neighbours behind the same NAT/CGNAT from collectively
    // exhausting each other's acceptance retries. Read the token before schema
    // validation so the key is stable even on malformed payloads.
    //
    // CE QUE CE LIMITEUR NE BORNE PAS (reserve S4' du contre-audit LOT 4). Le
    // rapport du lot precedent affirmait que "le limiteur token+IP borne les
    // essais" de l'oracle residuel (savoir si une adresse invitee possede deja
    // un compte). C'est FAUX: la cle contient le jeton, donc chaque nouvelle
    // invitation ouvre un budget neuf. La vraie borne est en amont, a la
    // CREATION de l'invitation: invitationManageLimiter, 30 par 10 minutes et
    // par IP (src/lib/rate-limit.ts), soit de l'ordre de 4300 adresses
    // sondables par jour et par IP - avec un courriel envoye a chacune, et la
    // qualite d'owner/admin exigee. Le cout de l'oracle vient de la, pas d'ici.
    const tokenForKey =
      typeof (body as { token?: unknown })?.token === 'string'
        ? (body as { token: string }).token
        : '';
    const ip = getClientIp(request);
    const { success: allowed } = await invitationAcceptLimiter.check(`${tokenForKey}:${ip}`);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const parsed = acceptInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Donnees invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // SECURITE (refutation R1 du contre-audit LOT 2): l'adresse de la session
    // est lue cote serveur avec auth.getUser() (jamais getSession(), jamais un
    // champ du body). Le service l'exige quand l'adresse invitee possede deja
    // un compte: sans elle, l'invitant - qui peut lire le jeton de
    // l'invitation qu'il a creee - accepterait a la place du titulaire.
    // L'absence de session n'est PAS un refus ici: un nouvel employe n'en a
    // pas encore, et c'est le service qui tranche selon le cas.
    const sessionClient = await createClient();
    const {
      data: { user: sessionUser },
    } = await sessionClient.auth.getUser();
    // Double authentification: un compte qui a un facteur n'accepte qu'en aal2.
    if (sessionUser && !(await isMfaSatisfied(sessionClient, sessionUser))) {
      return NextResponse.json(
        { error: MFA_REQUIRED_MESSAGE, code: MFA_REQUIRED_CODE },
        { status: 403 },
      );
    }

    const adminClient = createAdminClient();
    const service = createInvitationService(adminClient);

    // Validate token first, then check plan limits before accepting
    const invitation = await service.validateToken(parsed.data.token);

    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('id', invitation.tenant_id)
      .single();

    // Echec ferme (revue L022, A24): sans le restaurant, les limites du plan
    // etaient sautees et l'acceptation continuait. Un restaurant ferme ou
    // suspendu ne gagne pas de membre avec une invitation emise avant.
    if (tenantError || !tenant) {
      throw new ServiceError(
        'Impossible de verifier le restaurant. Reessayez dans un instant.',
        'INTERNAL',
        tenantError,
      );
    }
    if (tenant.is_active === false) {
      throw new ServiceError("Ce restaurant n'accepte plus de nouveaux membres.", 'CONFLICT');
    }

    const enforcement = createPlanEnforcementService(adminClient);
    // Siege d'administrateur ou de personnel: regle `isAdminSeat` (G.a). Une
    // invitation ne porte jamais `owner`: c'est un siege de personnel tant que
    // le gerant compte comme personnel.
    if (isAdminSeat(invitation.postes)) {
      await enforcement.canAddAdmin(tenant as Tenant);
    } else {
      await enforcement.canAddStaff(tenant as Tenant);
    }

    const { tenantSlug } = await service.acceptInvitation({
      token: parsed.data.token,
      fullName: parsed.data.full_name,
      password: parsed.data.password,
      authenticatedEmail: sessionUser?.email ?? undefined,
      // R1': l'identite enrolee vient de la session, pas de admin_users.email.
      authenticatedUserId: sessionUser?.id ?? undefined,
    });

    // A brand-new employee has no session yet: the account was just created
    // with the admin client. Sign them in with the password they chose, so the
    // redirect lands in their space instead of the login screen. Best effort:
    // the account exists either way, and the login screen still works.
    const motDePasse = parsed.data.password;
    // Identite du membre qui vient d'entrer: la session deja ouverte, ou celle
    // que la connexion automatique ci-dessous vient d'ouvrir.
    let memberUserId: string | undefined = sessionUser?.id;
    if (motDePasse && sessionUser?.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      const { data: signInData, error: signInError } = await sessionClient.auth.signInWithPassword({
        email: invitation.email,
        password: motDePasse,
      });
      if (signInError) {
        logger.warn('Invitation accepted but automatic sign-in failed', {
          code: signInError.code,
        });
      } else {
        memberUserId = signInData?.user?.id ?? memberUserId;
        // Premiere connexion: sans elle le membre restait "Jamais connecte" sur
        // la page Equipe (la connexion par mot de passe, /api/login, l'ecrit deja).
        // Meilleur effort: un compteur en echec ne bloque jamais l'acceptation.
        try {
          const { data: membership } = await sessionClient
            .from('admin_users')
            .select('id')
            .eq('user_id', memberUserId ?? '')
            .eq('tenant_id', invitation.tenant_id)
            .maybeSingle();
          if (membership) {
            const { error: trackError } = await sessionClient.rpc('increment_login_count', {
              admin_user_id: membership.id,
            });
            if (trackError) {
              logger.warn('Invitation login tracking failed', { error: String(trackError) });
            }
          }
        } catch (trackError) {
          logger.warn('Invitation login tracking failed', { error: String(trackError) });
        }
      }
    }

    // Journal d'audit: le membre qui accepte est l'auteur. Ni le jeton ni le
    // mot de passe n'y figurent.
    await createAuditService(adminClient, {
      tenantId: invitation.tenant_id,
      userId: memberUserId,
      userEmail: invitation.email,
      userRole: invitation.postes.join('+'),
    }).log({
      action: 'create',
      entityType: 'user',
      entityId: invitation.id,
      newData: { email: invitation.email, postes: invitation.postes },
      metadata: { event: 'invitation_accepted', invitation_id: invitation.id },
    });

    return NextResponse.json({ success: true, tenantSlug });
  } catch (error) {
    if (error instanceof ServiceError) {
      // B54: refus metier (membre retire): code dedie, pas une panne a journaliser.
      const reason = (error.details as { reason?: string } | undefined)?.reason;
      if (error.details && !reason) {
        logger.error('Invitation accept ServiceError details', {
          code: error.code,
          details: error.details,
        });
      }
      return NextResponse.json(
        { error: error.message, ...(reason ? { code: reason } : {}) },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Invitation accept error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
