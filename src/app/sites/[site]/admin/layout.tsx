import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { TrialBanner } from '@/components/admin/TrialBanner';

interface AdminUser {
  id: string;
  user_id: string;
  tenant_id: string;
  role: 'owner' | 'admin' | 'manager' | 'staff';
  name?: string;
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

  const supabase = await createClient();

  // Récupérer le tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .single();

  // ⚡ Vérifier si onboarding est terminé
  // Si non, rediriger vers le wizard d'onboarding
  if (!tenant) {
    redirect('/login');
  }

  if (tenant.onboarding_completed === false) {
    redirect('/onboarding');
  }

  // Vérifier l'authentification
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Mode développement : si pas d'auth configurée, afficher quand même
  let adminUser: AdminUser | null = null;
  let isDevMode = false;

  if (authError || !user) {
    // ✅ SECURITY FIX: Require explicit env var for dev bypass
    if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true') {
      isDevMode = true;
      adminUser = {
        id: 'dev',
        user_id: 'dev',
        tenant_id: tenant?.id || 'dev',
        role: 'owner',
        name: 'Dev User',
      };
    } else {
      // En production OU si bypass non explicitement activé
      redirect(`/admin/login`);
    }
  } else {
    // Vérifier que l'user est admin de CE tenant
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant?.id)
      .single();

    if (!adminData && process.env.NODE_ENV !== 'development') {
      redirect(`/unauthorized`);
    }

    adminUser = adminData || {
      id: user.id,
      user_id: user.id,
      tenant_id: tenant?.id || '',
      role: 'admin' as const,
      name: user.email,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _roleLabels: Record<string, string> = {
    owner: 'Propriétaire',
    admin: 'Administrateur',
    manager: 'Manager',
    staff: 'Équipe',
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Dev Mode Banner */}
      {isDevMode && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-yellow-900 text-xs text-center py-1 z-50">
          Mode développement - Authentification désactivée
        </div>
      )}

      {/* Sidebar */}
      <AdminSidebar
        tenant={
          tenant
            ? {
                name: tenant.name,
                slug: tenant.slug,
                logo_url: tenant.logo_url,
                primary_color: tenant.primary_color,
              }
            : { name: tenantSlug, slug: tenantSlug }
        }
        adminUser={
          adminUser
            ? {
                name: adminUser.name,
                role: adminUser.role,
              }
            : undefined
        }
        className={isDevMode ? 'pt-6' : ''}
      />

      {/* Main Content */}
      <main className={`lg:ml-64 min-h-screen ${isDevMode ? 'pt-6' : ''}`}>
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
          <div className="p-4 lg:p-8 pt-16 lg:pt-8">
            <TrialBanner tenantSlug={tenantSlug} />
            {children}
          </div>
        </SubscriptionProvider>
      </main>
    </div>
  );
}
