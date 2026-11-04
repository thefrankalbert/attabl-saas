import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { invitationAcceptLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createInvitationService } from '@/services/invitation.service';
import { acceptInvitationSchema } from '@/lib/validations/invitation.schema';
import { createPlanEnforcementService, STAFF_ROLES } from '@/services/plan-enforcement.service';
import type { Tenant } from '@/types/admin.types';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const body: unknown = await request.json();

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

    const adminClient = createAdminClient();
    const service = createInvitationService(adminClient);

    // Validate token first, then check plan limits before accepting
    const invitation = await service.validateToken(parsed.data.token);

    const { data: tenant } = await adminClient
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('id', invitation.tenant_id)
      .single();

    if (tenant) {
      const enforcement = createPlanEnforcementService(adminClient);
      // Staff roles count against maxStaff; admin/owner count against maxAdmins
      if ((STAFF_ROLES as readonly string[]).includes(invitation.role)) {
        await enforcement.canAddStaff(tenant as Tenant);
      } else {
        await enforcement.canAddAdmin(tenant as Tenant);
      }
    }

    const { tenantSlug } = await service.acceptInvitation({
      token: parsed.data.token,
      fullName: parsed.data.full_name,
      password: parsed.data.password,
      authenticatedEmail: sessionUser?.email ?? undefined,
      // R1': l'identite enrolee vient de la session, pas de admin_users.email.
      authenticatedUserId: sessionUser?.id ?? undefined,
    });

    return NextResponse.json({ success: true, tenantSlug });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.details) {
        logger.error('Invitation accept ServiceError details', {
          code: error.code,
          details: error.details,
        });
      }
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Invitation accept error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
