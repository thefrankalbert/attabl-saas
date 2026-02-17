'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Banknote,
  UtensilsCrossed,
  Users,
  ArrowRight,
  Clock,
  ChefHat,
  TrendingUp,
  Bell,
  Calendar,
  Eye,
  CheckCircle2,
  Utensils,
  Package,
  AlertTriangle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import StatsCard, { StatsCardSkeleton } from '@/components/admin/StatsCard';
import StatusBadge from '@/components/admin/StatusBadge';
import type { Order, DashboardStats, PopularItem } from '@/types/admin.types';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils/currency';
import type { CurrencyCode } from '@/types/admin.types';
import { cn } from '@/lib/utils';

interface StockItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
}

// ─── Helpers ───────────────────────────────────────────────

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "À l'instant";
  if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)}h`;
  return new Date(date).toLocaleDateString('fr-FR');
}

// formatPrice removed — replaced by formatCurrencyCompact

function MiniChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((value, i) => (
        <div
          key={i}
          className={`w-2 rounded-full transition-all duration-500 ${color}`}
          style={{ height: `${(value / max) * 100}%`, minHeight: '4px' }}
        />
      ))}
    </div>
  );
}

// ─── Types ─────────────────────────────────────────────────

interface DashboardClientProps {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  initialStats: DashboardStats;
  initialRecentOrders: Order[];
  initialPopularItems: PopularItem[];
  currency?: CurrencyCode;
}

// ─── Main Component ────────────────────────────────────────

export default function DashboardClient({
  tenantId,
  tenantSlug,
  tenantName,
  initialStats,
  initialRecentOrders,
  initialPopularItems,
  currency = 'XAF',
}: DashboardClientProps) {
  // Base path pour tous les liens admin
  const adminBase = `/sites/${tenantSlug}/admin`;
  const fmt = (amount: number) => formatCurrency(amount, currency);
  const fmtCompact = (amount: number) => formatCurrencyCompact(amount, currency);
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [recentOrders, setRecentOrders] = useState<Order[]>(initialRecentOrders);
  const [popularItems] = useState<PopularItem[]>(initialPopularItems);
  const [loading] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const { toast } = useToast();
  const supabase = createClient();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  const loadStats = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    try {
      const [ordersRes, itemsRes, venuesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, total_price, total')
          .eq('tenant_id', tenantId)
          .gte('created_at', today.toISOString()),
        supabase
          .from('menu_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_available', true),
        supabase
          .from('venues')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
      ]);
      const ordersData = ordersRes.data || [];
      setStats({
        ordersToday: ordersData.length,
        revenueToday: ordersData.reduce((sum, o) => sum + Number(o.total_price || o.total || 0), 0),
        activeItems: itemsRes.count || 0,
        activeCards: venuesRes.count || 0,
      });
    } catch {
      /* silently fail - stats are non-critical */
    }
  }, [supabase, tenantId]);

  const loadRecentOrders = useCallback(async () => {
    try {
      const { data: orders } = await supabase
        .from('orders')
        .select(
          `id, table_number, status, total_price, total, created_at,
         order_items(id, quantity, price_at_order, menu_items(name))`,
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(6);

      const formatted: Order[] = (orders || []).map((order: Record<string, unknown>) => ({
        id: order.id as string,
        tenant_id: tenantId,
        table_number: (order.table_number as string) || 'N/A',
        status: ((order.status as string) || 'pending') as Order['status'],
        total_price: Number(order.total_price || order.total || 0),
        created_at: order.created_at as string,
        items: ((order.order_items as Array<Record<string, unknown>>) || []).map(
          (item: Record<string, unknown>) => ({
            id: item.id as string,
            name: ((item.menu_items as Record<string, unknown>)?.name as string) || 'Item inconnu',
            quantity: item.quantity as number,
            price: item.price_at_order as number,
          }),
        ),
      }));
      setRecentOrders(formatted);
    } catch {
      /* silently fail */
    }
  }, [supabase, tenantId]);

  const loadStock = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('ingredients')
        .select('id, name, unit, current_stock, min_stock_alert')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('current_stock', { ascending: true })
        .limit(10);
      setStockItems((data as StockItem[]) || []);
    } catch {
      /* non-critical */
    }
  }, [supabase, tenantId]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      toast({ title: 'Statut mis à jour' });
      loadRecentOrders();
      loadStats();
    } catch {
      toast({ title: 'Erreur lors de la mise à jour', variant: 'destructive' });
    }
  };

  useEffect(() => {
    loadStock();

    const channel = supabase
      .channel(`dashboard-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          loadStats();
          loadRecentOrders();
        },
      )
      .subscribe();

    // Realtime for stock changes
    const stockChannel = supabase
      .channel(`dashboard-stock-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ingredients',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          loadStock();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(stockChannel);
    };
  }, [supabase, tenantId, loadStats, loadRecentOrders, loadStock]);

  if (loading) {
    return (
      <div className="space-y-8 pb-10">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-neutral-200 rounded-lg" />
          <div className="h-4 w-32 bg-neutral-100 rounded mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{getGreeting()} 👋</h1>
          <p className="text-neutral-500 text-sm mt-1 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {new Date().toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            <span className="text-neutral-300">•</span>
            <span className="font-medium text-neutral-700">{tenantName}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative p-2.5 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors">
            <Bell className="w-5 h-5 text-neutral-600" />
          </button>
          <Link
            href={`${adminBase}/pos`}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors"
          >
            <Banknote className="w-5 h-5" />
            Ouvrir Caisse
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Commandes"
          value={stats.ordersToday}
          icon={ShoppingBag}
          color="blue"
          subtitle="Aujourd'hui"
        />
        <StatsCard
          title="Revenus"
          value={fmtCompact(stats.revenueToday)}
          icon={Banknote}
          color="green"
          subtitle="Aujourd'hui"
        />
        <StatsCard
          title="Plats actifs"
          value={stats.activeItems}
          icon={UtensilsCrossed}
          color="purple"
          subtitle="Sur le menu"
        />
        <StatsCard
          title="Points de vente"
          value={stats.activeCards}
          icon={Users}
          color="orange"
          subtitle="Actifs"
        />
      </div>

      {/* Stock en direct */}
      {stockItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-neutral-600" />
              <div>
                <h2 className="text-lg font-bold text-neutral-900">Stock en direct</h2>
                <p className="text-sm text-neutral-500">
                  Top 10 produits (tri par stock croissant)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {stockItems.filter((s) => s.current_stock <= 0).length > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-bold">
                  <AlertTriangle className="w-3 h-3" />
                  {stockItems.filter((s) => s.current_stock <= 0).length} rupture
                </span>
              )}
              {stockItems.filter((s) => s.current_stock > 0 && s.current_stock <= s.min_stock_alert)
                .length > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 rounded-lg text-xs font-bold">
                  <AlertTriangle className="w-3 h-3" />
                  {
                    stockItems.filter(
                      (s) => s.current_stock > 0 && s.current_stock <= s.min_stock_alert,
                    ).length
                  }{' '}
                  bas
                </span>
              )}
              <Link
                href={`${adminBase}/inventory`}
                className="flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 transition-colors"
              >
                Voir tout <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {stockItems.map((item) => {
              const isOut = item.current_stock <= 0;
              const isLow = item.current_stock > 0 && item.current_stock <= item.min_stock_alert;
              const maxStock = Math.max(item.min_stock_alert * 3, item.current_stock, 1);
              const pct = Math.min((item.current_stock / maxStock) * 100, 100);

              return (
                <div
                  key={item.id}
                  className={cn(
                    'p-3 rounded-xl border transition-colors',
                    isOut
                      ? 'border-red-200 bg-red-50/50'
                      : isLow
                        ? 'border-amber-200 bg-amber-50/50'
                        : 'border-neutral-100 bg-neutral-50/50',
                  )}
                >
                  <p className="text-xs font-bold text-neutral-900 truncate">{item.name}</p>
                  <div className="mt-2 flex items-end justify-between">
                    <span
                      className={cn(
                        'text-lg font-black',
                        isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-neutral-900',
                      )}
                    >
                      {item.current_stock}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-medium">{item.unit}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-green-500',
                      )}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Orders + Popular Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-neutral-100">
            <div>
              <h2 className="text-lg font-bold text-neutral-900">Commandes récentes</h2>
              <p className="text-sm text-neutral-500">{recentOrders.length} commandes</p>
            </div>
            <Link
              href={`${adminBase}/orders`}
              className="flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-600 transition-colors"
            >
              Voir tout <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {recentOrders.length > 0 ? (
            <div className="divide-y divide-neutral-50">
              {recentOrders.map((order) => (
                <div key={order.id} className="p-4 hover:bg-neutral-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                        {order.table_number}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-neutral-900">
                            Table {order.table_number}
                          </h3>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="text-sm text-neutral-500 mt-0.5">
                          {order.items
                            ?.slice(0, 2)
                            .map((i) => i.name)
                            .join(', ')}
                          {order.items && order.items.length > 2 && ` +${order.items.length - 2}`}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-neutral-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {timeAgo(order.created_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Utensils className="w-3.5 h-3.5" />
                            {order.items?.reduce((s, i) => s + i.quantity, 0) || 0} articles
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-neutral-900">{fmt(order.total_price)}</p>
                      <div className="flex items-center gap-1 mt-2">
                        {order.status === 'pending' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'preparing')}
                            className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                            title="Commencer la préparation"
                          >
                            <ChefHat className="w-4 h-4" />
                          </button>
                        )}
                        {order.status === 'preparing' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'ready')}
                            className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                            title="Marquer comme prêt"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {order.status === 'ready' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'delivered')}
                            className="p-1.5 bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
                            title="Marquer comme livré"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <Link
                          href={`${adminBase}/orders`}
                          className="p-1.5 bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
                          title="Voir détails"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShoppingBag className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-1">Aucune commande</h3>
              <p className="text-sm text-neutral-500">Les nouvelles commandes apparaîtront ici</p>
            </div>
          )}
        </div>

        {/* Popular Items */}
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-neutral-100">
            <div>
              <h2 className="text-lg font-bold text-neutral-900">Top Plats</h2>
              <p className="text-sm text-neutral-500">Les plus commandés</p>
            </div>
          </div>
          {popularItems.length > 0 ? (
            <div className="p-4 space-y-3">
              {popularItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-neutral-50 transition-colors"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                      idx === 0
                        ? 'bg-amber-100 text-amber-700'
                        : idx === 1
                          ? 'bg-neutral-200 text-neutral-700'
                          : idx === 2
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {idx + 1}
                  </div>
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-12 h-12 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center">
                      <UtensilsCrossed className="w-5 h-5 text-neutral-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-neutral-900 truncate">{item.name}</p>
                    <p className="text-xs text-neutral-500">{item.order_count} commandes</p>
                  </div>
                  <div className="w-16">
                    <MiniChart
                      data={[3, 5, 4, 7, 6, 8, 5]}
                      color={
                        idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-neutral-400' : 'bg-orange-400'
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <UtensilsCrossed className="w-6 h-6 text-neutral-400" />
              </div>
              <p className="text-sm text-neutral-500">Aucune donnée disponible</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link
          href={`${adminBase}/kitchen`}
          className="flex items-center gap-4 p-4 bg-white border border-neutral-100 rounded-2xl hover:border-blue-200 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
            <ChefHat className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Cuisine</h3>
            <p className="text-xs text-neutral-500">Voir le KDS</p>
          </div>
        </Link>
        <Link
          href={`${adminBase}/orders`}
          className="flex items-center gap-4 p-4 bg-white border border-neutral-100 rounded-2xl hover:border-amber-200 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
            <ShoppingBag className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Commandes</h3>
            <p className="text-xs text-neutral-500">Gérer les commandes</p>
          </div>
        </Link>
        <Link
          href={`${adminBase}/items`}
          className="flex items-center gap-4 p-4 bg-white border border-neutral-100 rounded-2xl hover:border-emerald-200 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
            <UtensilsCrossed className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Plats</h3>
            <p className="text-xs text-neutral-500">Gérer les plats</p>
          </div>
        </Link>
        <Link
          href={`${adminBase}/reports`}
          className="flex items-center gap-4 p-4 bg-white border border-neutral-100 rounded-2xl hover:border-purple-200 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
            <TrendingUp className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Rapports</h3>
            <p className="text-xs text-neutral-500">Voir les stats</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
