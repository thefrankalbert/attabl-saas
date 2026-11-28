import { isMfaSatisfied, MFA_REQUIRED_CODE, MFA_REQUIRED_MESSAGE } from '@/lib/auth/mfa-assurance';
import { createClient } from '@/lib/supabase/server';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import {
  invitationManageLimiter,
  invitationTenantDailyLimiter,
  getClientIp,
} from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createInvitationService } from '@/services/invitation.service';
import { createAuditService } from '@/services/audit.service';
import { canGrantPostes } from '@/lib/auth/poste-authority';
import { loadPosteOverrides } from '@/lib/auth/member-rights';
import { createInvitationSchema } from '@/lib/validations/invitation.schema';
import { sendInvitationEmail } from '@/services/email.service';
import { jsonWithCache } from '@/lib/cache-headers';
import { createPlanEnforcementService, isAdminSeat } from '@/services/plan-enforcement.service';
import type { Tenant } from '@/types/admin.types';
import { parsePaginationFromUrl, buildPaginationMeta } from '@/lib/pagination';
import { runApiRoute } from '@/lib/api-route-context';
import { resolveLiveMember } from '@/lib/auth/resolve-admin-permission';
import { getTranslations } from 'next-intl/server';
import { retryAfterSeconds } from '@/lib/retry-after';
import { tenantLockResponse } from '@/lib/billing/tenant-lock-response';

export async function GET(request: Request) {
  return runApiRoute(request, async () => {
    try {
      const ip = getClientIp(request);
      const { success: allowed } = await invitationManageLimiter.check(ip);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Trop de requetes. Reessayez plus tard.' },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      }

      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
      }

      if (!(await isMfaSatisfied(supabase, user))) {
        return NextResponse.json(
          { error: MFA_REQUIRED_MESSAGE, code: MFA_REQUIRED_CODE },
          { status: 403 },
        );
      }

      // Scope to the tenant being managed (middleware-injected header), then verify
      // membership. Deriving the tenant from admin_users by user_id alone breaks for
      // multi-tenant owners (>1 row -> .single() returns null -> false 403).
      const headersList = await headers();
      const tenantSlug = readTenantSlug(headersList).slug;
      if (!tenantSlug) {
        return NextResponse.json({ error: 'Tenant non identifie' }, { status: 400 });
      }
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', tenantSlug)
        .single();
      if (!tenant) {
        return NextResponse.json({ error: 'Tenant non trouve' }, { status: 404 });
      }
      // Voir les invitations fait partie de la gestion de l'equipe: le droit
      // `team.manage` decide seul (un gerant l'a par defaut, le proprietaire
      // peut le lui retirer). Seuls les membres VIVANTS du restaurant passent.
      const member = await resolveLiveMember(supabase, user.id, tenant.id);
      if (member?.levels['team.manage'] !== 'full') {
        return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
      }

      const tenantId = tenant.id;

      const adminClient = createAdminClient();
      const service = createInvitationService(adminClient);
      const { page, pageSize } = parsePaginationFromUrl(request.url);
      const { invitations, total } = await service.getPendingInvitations(tenantId, {
        page,
        pageSize,
      });

      // Strip sensitive token field before returning
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const sanitized = invitations.map(({ token: _token, ...rest }) => rest);

      // no-store: invitations per-tenant, URL identique par user -> pas de cache navigateur.
      return jsonWithCache(
        {
          invitations: sanitized,
          pagination: buildPaginationMeta(page, pageSize, total),
        },
        'realtime',
      );
    } catch (error) {
      if (error instanceof ServiceError) {
        if (error.details) {
          logger.error('Invitations GET ServiceError details', {
            code: error.code,
            details: error.details,
          });
        }
        return NextResponse.json(
          { error: error.message },
          { status: serviceErrorToStatus(error.code) },
        );
      }
      logger.error('Invitations GET error', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return runApiRoute(request, async () => {
    try {
      const originErr = verifyOrigin(request);
      if (originErr) return originErr;

      const ip = getClientIp(request);
      const { success: allowed } = await invitationManageLimiter.check(ip);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Trop de requetes. Reessayez plus tard.' },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      }

      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
      }

      if (!(await isMfaSatisfied(supabase, user))) {
        return NextResponse.json(
          { error: MFA_REQUIRED_MESSAGE, code: MFA_REQUIRED_CODE },
          { status: 403 },
        );
      }

      // B3: un corps illisible est une requete invalide (400), pas une panne (500).
      const body: unknown = await request.json().catch(() => null);
      const parsed = createInvitationSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
            details: parsed.error.flatten().fieldErrors,
          },
          { status: 400 },
        );
      }

      // Scope to the tenant being managed (middleware-injected header), then verify
      // membership. Never derive the tenant from admin_users by user_id alone - it
      // breaks for multi-tenant owners and is ambiguous about which tenant to invite to.
      const headersList = await headers();
      const tenantSlug = readTenantSlug(headersList).slug;
      if (!tenantSlug) {
        return NextResponse.json({ error: 'Tenant non identifie' }, { status: 400 });
      }
      const { data: currentTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', tenantSlug)
        .single();
      if (!currentTenant) {
        return NextResponse.json({ error: 'Tenant non trouve' }, { status: 404 });
      }
      // Inviter fait entrer du personnel: le droit `team.manage` decide seul,
      // comme pour modifier un membre (check-tenant-admin).
      const actor = await resolveLiveMember(supabase, user.id, currentTenant.id);
      if (actor?.levels['team.manage'] !== 'full') {
        return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
      }
      const actorIsOwner = actor.isOwner;

      // Coupure du restaurant: inviter est une ecriture (revoquer, lui, reste permis).
      const locked = await tenantLockResponse(currentTenant.id);
      if (locked) return locked;

      // Seul le proprietaire pose un reglage par personne (decision du
      // 2026-11-09). Ce reglage prime sur tout: l'accepter d'un gerant lui
      // permettait de donner l'encaissement ou les reglages a un employe.
      if (parsed.data.permission_overrides && !actorIsOwner) {
        return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
      }

      const tenantId = currentTenant.id;

      const adminClient = createAdminClient();

      // SECURITE: on ne donne pas un droit qu'on n'a pas. Les postes de
      // l'invitation, avec les reglages du restaurant, ne doivent rien ouvrir
      // que l'invitant ne detienne. Meme regle que le changement de postes
      // (`canGrantPostes`), pour que les deux chemins ne divergent pas. ECHEC
      // FERME si les reglages du restaurant ne se lisent pas.
      const { overrides, failed } = await loadPosteOverrides(
        adminClient,
        tenantId,
        parsed.data.postes,
      );
      if (failed || !canGrantPostes(actor.levels, parsed.data.postes, overrides)) {
        return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
      }

      // Check plan limits before creating invitation
      const { data: tenant } = await adminClient
        .from('tenants')
        .select(
          'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
        )
        .eq('id', tenantId)
        .single();

      if (tenant) {
        const enforcement = createPlanEnforcementService(adminClient);
        // Siege d'administrateur ou de personnel: regle `isAdminSeat` (G.a).
        try {
          if (isAdminSeat(parsed.data.postes)) {
            await enforcement.canAddAdmin(tenant as Tenant);
          } else {
            await enforcement.canAddStaff(tenant as Tenant);
          }
        } catch (limitError) {
          // Limite du plan: code dedie pour que l'ecran Equipe affiche le
          // bandeau "plan superieur". Les membres deja presents ne sont jamais
          // touches, seul l'ajout est refuse.
          if (limitError instanceof ServiceError && limitError.code === 'VALIDATION') {
            return NextResponse.json(
              { error: limitError.message, code: 'PLAN_LIMIT' },
              { status: serviceErrorToStatus(limitError.code) },
            );
          }
          throw limitError;
        }
      }

      const service = createInvitationService(adminClient);
      await service.assertNotAlreadyMember(tenantId, parsed.data.email);

      // P-10: plafond quotidien de courriels d'invitation PAR RESTAURANT. Pris
      // apres l'identite, les droits, la validation, les limites de plan et le
      // doublon (un refus ordinaire ne consomme pas le quota), et avant toute
      // ecriture ou envoi.
      const daily = await invitationTenantDailyLimiter.check(tenantId);
      if (!daily.success) {
        const te = await getTranslations('errors');
        return NextResponse.json(
          { error: te('invitationDailyLimit') },
          { status: 429, headers: { 'Retry-After': retryAfterSeconds(daily.reset) } },
        );
      }
      const invitation = await service.createInvitation({
        tenantId,
        email: parsed.data.email,
        postes: parsed.data.postes,
        // FK invitations_invited_by_fkey references admin_users(id), NOT auth.users.
        // user.id is the auth user id; use the actor's membership-row PK.
        invitedBy: actor.adminUserId,
        permissionOverrides: parsed.data.permission_overrides,
      });

      // Journal d'audit: l'auteur est le membre qui invite, dans CE restaurant.
      // Le jeton d'invitation n'y figure jamais.
      await createAuditService(adminClient, {
        tenantId,
        userId: user.id,
        userEmail: user.email ?? undefined,
        userRole: actor.postes.join('+'),
      }).log({
        action: 'create',
        entityType: 'user',
        entityId: invitation.id,
        newData: { email: invitation.email, postes: invitation.postes, status: invitation.status },
        metadata: { event: 'invitation_created', invitation_id: invitation.id },
      });

      // Send invitation email only if the invitation is pending (not direct-add).
      // A delivery failure must NOT lose the created invitation (the admin can
      // resend): isolate the send, log the failure, and report emailSent so the
      // UI can warn "invitation creee mais email non envoye".
      let emailSent = true;
      if (invitation.status === 'pending') {
        const { data: tenant } = await adminClient
          .from('tenants')
          .select('name, logo_url, slug')
          .eq('id', tenantId)
          .single();

        const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com'}/auth/accept-invite?token=${invitation.token}`;

        try {
          const sent = await sendInvitationEmail(parsed.data.email, {
            restaurantName: tenant?.name || 'Restaurant',
            restaurantLogoUrl: tenant?.logo_url || undefined,
            postes: parsed.data.postes,
            inviteUrl,
          });
          if (!sent) {
            emailSent = false;
            logger.error('Invitation email send failed', {
              tenantId,
              invitationId: invitation.id,
            });
          }
        } catch (emailError) {
          emailSent = false;
          logger.error('Invitation email send threw', {
            tenantId,
            invitationId: invitation.id,
            error: emailError,
          });
        }
      }

      // Strip sensitive token field before returning
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { token: _token, ...sanitizedInvitation } = invitation;
      return NextResponse.json(
        { success: true, invitation: sanitizedInvitation, emailSent },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof ServiceError) {
        // B54: refus metier (membre retire): code dedie, pas une panne a journaliser.
        const reason = (error.details as { reason?: string } | undefined)?.reason;
        if (error.details && !reason) {
          logger.error('Invitations POST ServiceError details', {
            code: error.code,
            details: error.details,
          });
        }
        return NextResponse.json(
          { error: error.message, ...(reason ? { code: reason } : {}) },
          { status: serviceErrorToStatus(error.code) },
        );
      }
      logger.error('Invitations POST error', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  });
}
