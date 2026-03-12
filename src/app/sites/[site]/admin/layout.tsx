import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTenant } from '@/lib/cache';
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { TrialBanner } from '@/components/admin/TrialBanner';
import { AdminIdleWrapper } from '@/components/admin/AdminIdleWrapper';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { OfflineIndicator } from '@/components/admin/OfflineIndicator';
import { CommandPalette } from '@/components/features/command-palette/CommandPalette';
import { ShortcutsProvider } from '@/contexts/ShortcutsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AdminBreadcrumbs } from '@/components/admin/AdminBreadcrumbs';
import { NotificationCenter } from '@/components/admin/NotificationCenter';
import { AdminContentWrapper } from '@/components/admin/AdminContentWrapper';
import { OnboardingResumeDialog } from '@/components/admin/OnboardingResumeDialog';
import { SoundProvider } from '@/contexts/SoundContext';
import type { AdminRole } from '@/types/admin.types';

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
    redirect('/login');
  }

  const showOnboardingResume = tenant.onboarding_completed === false;

  let adminUser: AdminUser | null = null;

  if (authError || !user) {
    redirect(`/login`);
  } else {
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .single();

    if (!adminData) {
      redirect(`/unauthorized`);
    }

    adminUser = adminData;
  }

  // Fetch all tenants managed by this user (for tenant switcher)
  const { data: userTenantLinks } = await supabase
    .from('admin_users')
    .select('tenant_id, tenants(id, name, slug)')
    .eq('user_id', user.id);

  const userTenants = (userTenantLinks ?? [])
    .map((link) => {
      const t = link.tenants as unknown as { id: string; name: string; slug: string } | null;
      return t ? { id: t.id, name: t.name, slug: t.slug } : null;
    })
    .filter((t): t is { id: string; name: string; slug: string } => t !== null);

  const userRole = (adminUser?.role ?? 'admin') as AdminRole;

  return (
    <div>
      {showOnboardingResume && <OnboardingResumeDialog />}
      <QueryProvider>
        <ThemeProvider>
          <SoundProvider
            tenantId={tenant.id}
            notificationSoundId={tenant.notification_sound_id ?? undefined}
          >
            <AdminLayoutClient
              isDevMode={false}
              basePath={`/sites/${tenantSlug}/admin`}
              role={userRole}
              tenant={{
                name: tenant.name,
                slug: tenant.slug,
                logo_url: tenant.logo_url ?? undefined,
                subscription_plan: tenant.subscription_plan ?? undefined,
              }}
              userName={adminUser?.name || user.email || ''}
              userTenants={userTenants}
              notifications={
                <NotificationCenter tenantId={tenant.id} userId={adminUser?.user_id} />
              }
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
                    >
                      <AdminContentWrapper chrome={<TrialBanner tenantSlug={tenantSlug} />}>
                        {children}
                      </AdminContentWrapper>
                    </SubscriptionProvider>
                  </AdminIdleWrapper>
                </ShortcutsProvider>
              </PermissionsProvider>
            </AdminLayoutClient>
          </SoundProvider>
        </ThemeProvider>
      </QueryProvider>
    </div>
  );
}
