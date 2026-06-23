import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { invitationLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createInvitationService } from '@/services/invitation.service';
import { canGrantRole } from '@/lib/auth/role-hierarchy';
import { createInvitationSchema } from '@/lib/validations/invitation.schema';
import { sendInvitationEmail } from '@/services/email.service';
import { jsonWithCache } from '@/lib/cache-headers';
import { createPlanEnforcementService, STAFF_ROLES } from '@/services/plan-enforcement.service';
import type { Tenant } from '@/types/admin.types';
import { parsePaginationFromUrl, buildPaginationMeta } from '@/lib/pagination';
import { runApiRoute } from '@/lib/api-route-context';

export async function GET(request: Request) {
  return runApiRoute(request, async () => {
    try {
      const ip = getClientIp(request);
      const { success: allowed } = await invitationLimiter.check(ip);
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

      // Scope to the tenant being managed (middleware-injected header), then verify
      // membership. Deriving the tenant from admin_users by user_id alone breaks for
      // multi-tenant owners (>1 row -> .single() returns null -> false 403).
      const headersList = await headers();
      const tenantSlug = headersList.get('x-tenant-slug');
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
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('role')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .in('role', ['owner', 'admin'])
        .maybeSingle();

      if (!adminUser) {
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
      const { success: allowed } = await invitationLimiter.check(ip);
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

      const body: unknown = await request.json();
      const parsed = createInvitationSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Donnees invalides', details: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }

      // Scope to the tenant being managed (middleware-injected header), then verify
      // membership. Never derive the tenant from admin_users by user_id alone - it
      // breaks for multi-tenant owners and is ambiguous about which tenant to invite to.
      const headersList = await headers();
      const tenantSlug = headersList.get('x-tenant-slug');
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
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('role')
        .eq('user_id', user.id)
        .eq('tenant_id', currentTenant.id)
        .eq('is_active', true)
        .in('role', ['owner', 'admin'])
        .maybeSingle();

      if (!adminUser) {
        return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
      }

      // SECURITY: prevent privilege escalation - an admin can only invite roles
      // strictly below admin (never another admin or an owner). Same policy as
      // actionCreateAdminUser, shared via canGrantRole so the two creation
      // paths cannot diverge.
      if (!canGrantRole(adminUser.role, parsed.data.role)) {
        return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
      }

      const tenantId = currentTenant.id;

      const adminClient = createAdminClient();

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
        // Staff roles count against maxStaff; admin/owner count against maxAdmins
        if ((STAFF_ROLES as readonly string[]).includes(parsed.data.role)) {
          await enforcement.canAddStaff(tenant as Tenant);
        } else {
          await enforcement.canAddAdmin(tenant as Tenant);
        }
      }

      const service = createInvitationService(adminClient);
      const invitation = await service.createInvitation({
        tenantId,
        email: parsed.data.email,
        role: parsed.data.role,
        invitedBy: user.id,
        customPermissions: parsed.data.custom_permissions,
      });

      // Send invitation email only if the invitation is pending (not direct-add)
      if (invitation.status === 'pending') {
        const { data: tenant } = await adminClient
          .from('tenants')
          .select('name, logo_url, slug')
          .eq('id', tenantId)
          .single();

        const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com'}/auth/accept-invite?token=${invitation.token}`;

        await sendInvitationEmail(parsed.data.email, {
          restaurantName: tenant?.name || 'Restaurant',
          restaurantLogoUrl: tenant?.logo_url || undefined,
          role: parsed.data.role,
          inviteUrl,
        });
      }

      // Strip sensitive token field before returning
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { token: _token, ...sanitizedInvitation } = invitation;
      return NextResponse.json({ success: true, invitation: sanitizedInvitation }, { status: 201 });
    } catch (error) {
      if (error instanceof ServiceError) {
        if (error.details) {
          logger.error('Invitations POST ServiceError details', {
            code: error.code,
            details: error.details,
          });
        }
        return NextResponse.json(
          { error: error.message },
          { status: serviceErrorToStatus(error.code) },
        );
      }
      logger.error('Invitations POST error', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  });
}
