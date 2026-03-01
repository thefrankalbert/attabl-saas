import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCachedTenant } from '@/lib/cache';
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
import type { AdminRole } from '@/types/admin.types';

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

  // Run tenant fetch (cached) + auth check in PARALLEL to cut latency
  const supabase = await createClient();
  const [
    tenant,
    {
      data: { user },
      error: authError,
    },
  ] = await Promise.all([getCachedTenant(tenantSlug), supabase.auth.getUser()]);

  if (!tenant) {
    redirect('/login');
  }

  const showOnboardingResume = tenant.onboarding_completed === false;

  let adminUser: AdminUser | null = null;
  let isDevMode = false;

  if (authError || !user) {
    if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true') {
      isDevMode = true;
      adminUser = {
        id: 'dev',
        user_id: 'dev',
        tenant_id: tenant.id || 'dev',
        role: 'owner',
        name: 'Dev User',
      };
    } else {
      redirect(`/login`);
    }
  } else {
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .single();

    if (!adminData && process.env.NODE_ENV !== 'development') {
      redirect(`/unauthorized`);
    }

    adminUser = adminData || {
      id: user.id,
      user_id: user.id,
      tenant_id: tenant.id || '',
      role: 'admin' as const,
      name: user.email,
    };
  }

  const userRole = (adminUser?.role ?? 'admin') as AdminRole;

  return (
    <div>
      <OfflineIndicator />
      {showOnboardingResume && <OnboardingResumeDialog />}
      {/* Dev Mode Banner */}
      {isDevMode && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-yellow-900 text-xs text-center py-1 z-50">
          Mode développement - Authentification désactivée
        </div>
      )}

      <QueryProvider>
        <ThemeProvider>
          <AdminLayoutClient
            isDevMode={isDevMode}
            basePath={`/sites/${tenantSlug}/admin`}
            role={userRole}
            primaryColor={tenant.primary_color ?? undefined}
            tenant={{
              name: tenant.name,
              slug: tenant.slug,
              logo_url: tenant.logo_url ?? undefined,
            }}
            notifications={<NotificationCenter tenantId={tenant.id} userId={adminUser?.user_id} />}
          >
            <PermissionsProvider role={userRole}>
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
                    <AdminContentWrapper
                      chrome={
                        <>
                          <TrialBanner tenantSlug={tenantSlug} />
                          <AdminBreadcrumbs />
                        </>
                      }
                    >
                      {children}
                    </AdminContentWrapper>
                  </SubscriptionProvider>
                </AdminIdleWrapper>
              </ShortcutsProvider>
            </PermissionsProvider>
          </AdminLayoutClient>
        </ThemeProvider>
      </QueryProvider>
    </div>
  );
}
