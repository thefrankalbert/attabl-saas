import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingBag, Banknote, UtensilsCrossed, Clock, AlertCircle } from 'lucide-react';

export default async function AdminDashboard() {
  const supabase = await createClient();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  // Récupérer le tenant
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .single();

  // Mode dev : afficher des données de démo si pas de tenant
  if (tenantError || !tenant) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-500 mb-8">Bienvenue sur votre tableau de bord</p>

        {/* Info Card */}
        <Card className="mb-8 border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800">Configuration requise</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Le tenant &quot;{tenantSlug}&quot; n&apos;est pas encore configuré dans la base de données.
                  Les statistiques ci-dessous sont des données de démonstration.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Demo Stats */}
        <DemoStats />
      </div>
    );
  }

  // Stats du jour
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Nombre de commandes aujourd'hui
  const { count: ordersToday } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .gte('created_at', today.toISOString());

  // Revenu du jour
  const { data: ordersData } = await supabase
    .from('orders')
    .select('total')
    .eq('tenant_id', tenant.id)
    .gte('created_at', today.toISOString());

  const revenueToday = ordersData?.reduce((sum, order) => sum + Number(order.total || 0), 0) || 0;

  // Commandes en cours (pending, preparing)
  const { count: activeOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .in('status', ['pending', 'preparing', 'ready']);

  // Nombre de menu items actifs
  const { count: menuItemsCount } = await supabase
    .from('menu_items')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('is_available', true);

  // Commandes récentes
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(5);

  const stats = [
    {
      title: 'Commandes du jour',
      value: ordersToday || 0,
      icon: ShoppingBag,
      description: 'Commandes reçues aujourd\'hui',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Revenu du jour',
      value: `${revenueToday.toLocaleString('fr-FR')} F`,
      icon: Banknote,
      description: 'Chiffre d\'affaires du jour',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Commandes actives',
      value: activeOrders || 0,
      icon: Clock,
      description: 'En attente ou en préparation',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Articles au menu',
      value: menuItemsCount || 0,
      icon: UtensilsCrossed,
      description: 'Produits disponibles',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
    preparing: { label: 'En préparation', color: 'bg-blue-100 text-blue-800' },
    ready: { label: 'Prêt', color: 'bg-green-100 text-green-800' },
    delivered: { label: 'Livré', color: 'bg-gray-100 text-gray-800' },
    cancelled: { label: 'Annulé', color: 'bg-red-100 text-red-800' },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-500 mt-1">{tenant.name}</p>
        </div>
        <div className="text-sm text-gray-500">
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                  <p className="text-3xl font-bold mt-2">{stat.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{stat.description}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Orders */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Commandes récentes</CardTitle>
          <a href="/admin/orders" className="text-sm text-blue-600 hover:underline">
            Voir tout →
          </a>
        </CardHeader>
        <CardContent>
          {recentOrders && recentOrders.length > 0 ? (
            <div className="space-y-4">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between py-3 border-b last:border-0"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <ShoppingBag className="h-5 w-5 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium">Commande #{order.id.slice(-6)}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(order.created_at).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                        {order.table_number && ` • Table ${order.table_number}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusLabels[order.status]?.color || 'bg-gray-100'}`}>
                      {statusLabels[order.status]?.label || order.status}
                    </span>
                    <span className="font-semibold">
                      {Number(order.total || 0).toLocaleString('fr-FR')} F
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucune commande pour le moment</p>
              <p className="text-sm text-gray-400 mt-1">
                Les nouvelles commandes apparaîtront ici
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Composant de stats démo pour le mode développement
function DemoStats() {
  const stats = [
    {
      title: 'Commandes du jour',
      value: 12,
      icon: ShoppingBag,
      description: 'Données de démonstration',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Revenu du jour',
      value: '156 000 F',
      icon: Banknote,
      description: 'Données de démonstration',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Commandes actives',
      value: 3,
      icon: Clock,
      description: 'Données de démonstration',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Articles au menu',
      value: 45,
      icon: UtensilsCrossed,
      description: 'Données de démonstration',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-0 shadow-sm opacity-75">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                  <p className="text-3xl font-bold mt-2">{stat.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{stat.description}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Commandes récentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucune commande pour le moment</p>
            <p className="text-sm text-gray-400 mt-1">
              Configurez Supabase pour voir les vraies données
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
