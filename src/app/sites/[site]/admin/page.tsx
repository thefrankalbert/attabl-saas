import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import DashboardClient from '@/components/admin/DashboardClient';
import type { Order, DashboardStats, PopularItem } from '@/types/admin.types';
import { AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

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

  if (tenantError || !tenant) {
    return (
      <div className="p-8">
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-yellow-800">Configuration requise</p>
            <p className="text-sm text-yellow-700 mt-1">
              Le tenant &quot;{tenantSlug}&quot; n&apos;est pas encore configuré.
            </p>
          </div>
        </div>
      </div>
    );
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Requêtes parallèles pour optimiser la performance
    const [ordersRes, itemsCountRes, venuesCountRes, recentOrdersRes, popularRes] =
      await Promise.all([
        // Commandes du jour (pour stats)
        supabase
          .from('orders')
          .select('id, total_price, total, status')
          .eq('tenant_id', tenant.id)
          .gte('created_at', today.toISOString()),

        // Nombre d'items actifs
        supabase
          .from('menu_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('is_available', true),

        // Nombre de venues actifs
        supabase
          .from('venues')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('is_active', true),

        // Commandes récentes
        supabase
          .from('orders')
          .select(
            `id, table_number, status, total_price, total, created_at,
           order_items(id, quantity, price_at_order, menu_items(name))`,
          )
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })
          .limit(6),

        // Items pour calcul de popularité
        supabase
          .from('order_items')
          .select('menu_item_id, quantity, menu_items(id, name, image_url)')
          .not('menu_item_id', 'is', null),
      ]);

    // Stats
    const ordersData = ordersRes.data || [];
    const initialStats: DashboardStats = {
      ordersToday: ordersData.length,
      revenueToday: ordersData
        .filter((o) => o.status === 'delivered')
        .reduce((sum, o) => sum + Number(o.total_price || o.total || 0), 0),
      activeItems: itemsCountRes.count || 0,
      activeCards: venuesCountRes.count || 0,
    };

    // Recent Orders
    const initialRecentOrders: Order[] = (recentOrdersRes.data || []).map(
      (order: Record<string, unknown>) => ({
        id: order.id as string,
        tenant_id: tenant.id,
        table_number: (order.table_number as string) || 'N/A',
        status: ((order.status as string) || 'pending') as Order['status'],
        total_price: Number(order.total_price || order.total || 0),
        created_at: order.created_at as string,
        items: (
          (order.order_items as Array<Record<string, unknown>>) || []
        ).map((item: Record<string, unknown>) => ({
          id: item.id as string,
          name:
            ((item.menu_items as Record<string, unknown>)?.name as string) || 'Item inconnu',
          quantity: item.quantity as number,
          price: item.price_at_order as number,
        })),
      }),
    );

    // Popular Items
    const itemCounts: Record<string, PopularItem> = {};
    ((popularRes.data as Array<Record<string, unknown>>) || []).forEach(
      (item: Record<string, unknown>) => {
        const menuItem = item.menu_items as Record<string, unknown> | null;
        if (menuItem) {
          const id = item.menu_item_id as string;
          if (!itemCounts[id]) {
            itemCounts[id] = {
              id,
              name: (menuItem.name as string) || '',
              image_url: menuItem.image_url as string | undefined,
              order_count: 0,
            };
          }
          itemCounts[id].order_count += item.quantity as number;
        }
      },
    );

    const initialPopularItems = Object.values(itemCounts)
      .sort((a, b) => b.order_count - a.order_count)
      .slice(0, 5);

    return (
      <DashboardClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        initialStats={initialStats}
        initialRecentOrders={initialRecentOrders}
        initialPopularItems={initialPopularItems}
      />
    );
  } catch {
    // Fallback avec données vides
    return (
      <DashboardClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        initialStats={{ ordersToday: 0, revenueToday: 0, activeItems: 0, activeCards: 0 }}
        initialRecentOrders={[]}
        initialPopularItems={[]}
      />
    );
  }
}
