import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Settings,
  CreditCard,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

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

  // Vérifier l'authentification
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // Mode développement : si pas d'auth configurée, afficher quand même
  let adminUser: AdminUser | null = null;
  let isDevMode = false;

  if (authError || !user) {
    // En dev, on permet l'accès sans auth
    if (process.env.NODE_ENV === 'development') {
      isDevMode = true;
      adminUser = {
        id: 'dev',
        user_id: 'dev',
        tenant_id: tenant?.id || 'dev',
        role: 'owner',
        name: 'Dev User'
      };
    } else {
      // En production, rediriger vers login
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
      name: user.email
    };
  }

  const navigation = [
    { name: 'Dashboard', href: `/admin`, icon: LayoutDashboard },
    { name: 'Commandes', href: `/admin/orders`, icon: ShoppingBag },
    { name: 'Menus', href: `/admin/menus`, icon: UtensilsCrossed },
    { name: 'Abonnement', href: `/admin/subscription`, icon: CreditCard },
    { name: 'Paramètres', href: `/admin/settings`, icon: Settings },
  ];

  const roleLabels: Record<string, string> = {
    owner: 'Propriétaire',
    admin: 'Administrateur',
    manager: 'Manager',
    staff: 'Équipe'
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
      <aside className={`fixed inset-y-0 left-0 w-64 bg-white shadow-lg z-40 ${isDevMode ? 'pt-6' : ''}`}>
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            {tenant?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logo_url}
                alt={tenant?.name || tenantSlug}
                className="w-10 h-10 rounded-lg object-contain"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: tenant?.primary_color || '#374151' }}
              >
                {(tenant?.name || tenantSlug).charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">
                {tenant?.name || tenantSlug}
              </h2>
              <p className="text-xs text-gray-500">
                {adminUser ? roleLabels[adminUser.role] || adminUser.role : 'Admin'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors group"
            >
              <item.icon className="h-5 w-5 text-gray-400 group-hover:text-gray-600" />
              <span className="font-medium">{item.name}</span>
              <ChevronRight className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 w-full p-4 border-t bg-white">
          {/* User Info */}
          {adminUser && (
            <div className="flex items-center gap-3 px-4 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-sm font-medium text-gray-600">
                  {(adminUser.name || 'A').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {adminUser.name || 'Admin'}
                </p>
              </div>
            </div>
          )}

          {/* Logout */}
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Déconnexion</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`ml-64 min-h-screen ${isDevMode ? 'pt-6' : ''}`}>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
