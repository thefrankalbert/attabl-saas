import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { headers } from 'next/headers';
import { getTenant } from '@/lib/cache';
import { redirectToLogin, redirectToUnauthorized } from '@/lib/auth/redirect-to-main';
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { SubscriptionBanners } from '@/components/admin/SubscriptionBanners';
import { AdminIdleWrapper } from '@/components/admin/AdminIdleWrapper';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { OfflineIndicator } from '@/components/admin/OfflineIndicator';
import { CommandPalette } from '@/components/features/command-palette/CommandPalette';
import { ShortcutsProvider } from '@/contexts/ShortcutsContext';
import { AdminBreadcrumbs } from '@/components/admin/AdminBreadcrumbs';
import { NotificationCenter } from '@/components/admin/NotificationCenter';
import { AdminContentWrapper } from '@/components/admin/AdminContentWrapper';
import { OnboardingResumeDialog } from '@/components/admin/OnboardingResumeDialog';
import { SoundProvider } from '@/contexts/SoundContext';
import { getMonthlyOrdersCount } from '@/lib/admin/monthly-orders-count';
import { getPlanLimits } from '@/lib/plans/features';
import { getTenantMonthStart } from '@/lib/timezones';
import type { AdminRole } from '@/types/admin.types';
import type { PermissionCode, RolePermissions } from '@/types/permission.types';
import { getEffectivePermissions } from '@/lib/permissions';
import { determineTrialEventKey, sendTrialEmailForKey } from '@/services/trigger-emails.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface AdminUser {
  id: string;
  user_id: string;
  tenant_id: string;
  role: AdminRole;
  name?: string;
  custom_permissions?: Record<string, boolean> | null;
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  // Run tenant fetch + auth check in PARALLEL to cut latency
  const supabase = await createClient();
  const [
    tenant,
    {
      data: { user },
      error: authError,
    },
  ] = await Promise.all([getTenant(tenantSlug), supabase.auth.getUser()]);

  if (!tenant) {
    redirectToLogin();
  }

  const showOnboardingResume = tenant.onboarding_completed === false;

  let adminUser: AdminUser | null = null;

  if (authError || !user) {
    redirectToLogin();
  } else {
    // First, check if the user is a direct member of this tenant.
    // Banned (is_active=false) or soft-deleted (deleted_at) memberships must NOT
    // grant dashboard access - a super-admin ban has to fully lock the user out,
    // not just block writes. Excluding them here drops through to the
    // super-admin check and ultimately redirectToUnauthorized().
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('id, user_id, tenant_id, email, full_name, role, is_active, custom_permissions')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (adminData) {
      adminUser = { ...adminData, name: adminData.full_name ?? adminData.email ?? undefined };
    } else {
      // Not a direct member - check if the user is a super_admin (can access any tenant).
      // A revoked operator (banned / soft-deleted) must NOT keep this access, so
      // only a LIVE super-admin membership counts.
      const { data: superAdminCheck } = await supabase
        .from('admin_users')
        .select('id, user_id, tenant_id, role, name, custom_permissions, is_super_admin')
        .eq('user_id', user.id)
        .eq('is_super_admin', true)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!superAdminCheck) {
        redirectToUnauthorized();
      }

      // Super admin: create a virtual admin entry with owner-level access
      adminUser = {
        id: superAdminCheck.id,
        user_id: superAdminCheck.user_id,
        tenant_id: tenant.id,
        role: 'owner' as AdminRole,
        name: superAdminCheck.name,
        custom_permissions: null,
      };
    }
  }

  // Fetch all tenants managed by this user (for tenant switcher). Exclude
  // banned / soft-deleted memberships so a locked-out link never shows.
  const { data: userTenantLinks } = await supabase
    .from('admin_users')
    .select('tenant_id, tenants(id, name, slug)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('deleted_at', null);

  // Monthly orders usage for the sidebar footer card.
  //
  // - Quota is derived from the tenant's effective plan
  //   (see src/lib/plans/features.ts PLAN_LIMITS.maxMonthlyOrders).
  //   `-1` means unlimited → the bar collapses to 0%.
  // - Month start is computed in the tenant's local timezone (best-effort
  //   resolved from tenant.country) so the bar rolls over at local midnight.
  // - The count query is wrapped in unstable_cache (5 min TTL per tenant)
  //   so admin-to-admin navigation doesn't hit Postgres every time.
  // - All failure paths return 0 % rather than crashing the admin shell.
  const planLimits = getPlanLimits(
    tenant.subscription_plan,
    tenant.subscription_status,
    tenant.trial_ends_at,
  );
  const monthlyQuota = planLimits.maxMonthlyOrders;
  let ordersUsagePercent = 0;
  if (monthlyQuota > 0) {
    const monthStart = getTenantMonthStart({ country: tenant.country });
    const monthlyOrdersCount = await getMonthlyOrdersCount(tenant.id, monthStart);
    ordersUsagePercent = Math.min(100, Math.round((monthlyOrdersCount / monthlyQuota) * 100));
  }

  const userTenants = (userTenantLinks ?? [])
    .map((link) => {
      // Supabase join type gap
      const t = link.tenants as unknown as { id: string; name: string; slug: string } | null;
      return t ? { id: t.id, name: t.name, slug: t.slug } : null;
    })
    .filter((t): t is { id: string; name: string; slug: string } => t !== null);

  // Fire-and-forget: update last_active_at and check trial email triggers
  void (async () => {
    try {
      const adminClient = createAdminClient();
      const now = new Date().toISOString();

      await adminClient.from('tenants').update({ last_active_at: now }).eq('id', tenant.id);

      if (tenant.subscription_status === 'trial' && user?.email) {
        const activationEvents =
          (tenant.activation_events as Record<string, string> | undefined) ?? {};
        const dashboardUrl = `https://${tenantSlug}.attabl.com/admin`;

        const { count: ordersCount } = await adminClient
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .then((r) => ({ count: r.count ?? 0 }));

        const { data: ownerUser } = await adminClient
          .from('admin_users')
          .select('email')
          .eq('tenant_id', tenant.id)
          .eq('role', 'owner')
          .maybeSingle();
        const ownerEmail = ownerUser?.email ?? user.email;

        const eventKey = determineTrialEventKey({
          trialEndsAt: tenant.trial_ends_at,
          lastActiveAt: tenant.last_active_at ?? null,
          activationEvents,
        });

        if (eventKey) {
          // Atomically claim the event slot - only update if key doesn't exist yet
          const { data: claimed } = await adminClient
            .from('tenants')
            .update({ activation_events: { ...activationEvents, [eventKey]: now } })
            .eq('id', tenant.id)
            .filter(`activation_events->>${eventKey}`, 'is', null)
            .select('id');
          if (claimed?.length) {
            await sendTrialEmailForKey(eventKey, {
              adminEmail: ownerEmail,
              restaurantName: tenant.name,
              dashboardUrl,
              trialEndsAt: tenant.trial_ends_at,
              ordersCount,
            });
          }
        }
      }
    } catch (err) {
      logger.warn('Admin layout: background activity tracking failed', { err });
    }
  })();

  // Real nav badge counts (open orders / in-kitchen / active items). Best-effort,
  // tenant-scoped, cheap head counts; failures leave the badge hidden.
  let navCounts: { orders?: number; kitchen?: number; items?: number } = {};
  try {
    const [openOrdersRes, kitchenRes, itemsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .in('status', ['pending', 'preparing', 'ready']),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .in('status', ['preparing', 'ready']),
      supabase
        .from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_available', true),
    ]);
    navCounts = {
      orders: openOrdersRes.count ?? undefined,
      kitchen: kitchenRes.count ?? undefined,
      items: itemsRes.count ?? undefined,
    };
  } catch {
    // counts are best-effort; ignore failures
  }

  const userRole = (adminUser?.role ?? 'admin') as AdminRole;

  // Effective permissions for sidebar nav filtering. Reflects the full 3-level
  // resolution (per-user custom_permissions -> per-tenant role_permissions
  // override -> default matrix) so the sidebar hides links the member cannot
  // open, instead of showing them and bouncing to /unauthorized on click.
  // Owner short-circuits to all-true inside getEffectivePermissions.
  let navRoleOverride: RolePermissions | null = null;
  if (userRole !== 'owner') {
    const { data: ro } = await supabase
      .from('role_permissions')
      .select('permissions')
      .eq('tenant_id', tenant.id)
      .eq('role', userRole)
      .maybeSingle();
    navRoleOverride = ro ? ({ permissions: ro.permissions } as unknown as RolePermissions) : null;
  }
  const navPermissions: Record<PermissionCode, boolean> = getEffectivePermissions(
    { role: userRole, custom_permissions: adminUser?.custom_permissions ?? null } as never,
    navRoleOverride,
  );

  return (
    <div>
      {showOnboardingResume && <OnboardingResumeDialog />}
      <QueryProvider>
        <SoundProvider
          tenantId={tenant.id}
          notificationSoundId={tenant.notification_sound_id ?? undefined}
        >
          <AdminLayoutClient
            isDevMode={false}
            basePath={`/sites/${tenantSlug}/admin`}
            role={userRole}
            navPermissions={navPermissions}
            tenant={{
              name: tenant.name,
              slug: tenant.slug,
              logo_url: tenant.logo_url ?? undefined,
              subscription_plan: tenant.subscription_plan ?? undefined,
              establishment_type: tenant.establishment_type ?? undefined,
            }}
            userName={adminUser?.name || user.email || ''}
            userEmail={user.email ?? undefined}
            ordersUsagePercent={ordersUsagePercent}
            navCounts={navCounts}
            userTenants={userTenants}
            notifications={<NotificationCenter tenantId={tenant.id} userId={adminUser?.user_id} />}
            breadcrumbs={<AdminBreadcrumbs />}
          >
            <PermissionsProvider role={userRole}>
              <OfflineIndicator />
              <CommandPalette />
              <ShortcutsProvider basePath={`/sites/${tenantSlug}/admin`}>
                <AdminIdleWrapper
                  idleTimeoutMinutes={tenant.idle_timeout_minutes ?? null}
                  screenLockMode={tenant.screen_lock_mode ?? 'overlay'}
                  tenantName={tenant.name}
                >
                  <SubscriptionProvider
                    tenant={
                      tenant
                        ? {
                            subscription_plan: tenant.subscription_plan,
                            subscription_status: tenant.subscription_status,
                            trial_ends_at: tenant.trial_ends_at,
                          }
                        : null
                    }
                    tenantSlug={tenantSlug}
                  >
                    <AdminContentWrapper chrome={<SubscriptionBanners tenantSlug={tenantSlug} />}>
                      {children}
                    </AdminContentWrapper>
                  </SubscriptionProvider>
                </AdminIdleWrapper>
              </ShortcutsProvider>
            </PermissionsProvider>
          </AdminLayoutClient>
        </SoundProvider>
      </QueryProvider>
    </div>
  );
}
