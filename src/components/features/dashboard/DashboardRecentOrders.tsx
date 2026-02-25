'use client';

import Link from 'next/link';
import {
  ShoppingBag,
  ArrowRight,
  Clock,
  ChefHat,
  Eye,
  CheckCircle2,
  Utensils,
  Package,
} from 'lucide-react';
import StatusBadge from '@/components/admin/StatusBadge';
import type { Order } from '@/types/admin.types';
import { cn } from '@/lib/utils';
import type { StockItem } from '@/hooks/useDashboardData';

// ─── Types ─────────────────────────────────────────────────

interface DashboardRecentOrdersProps {
  recentOrders: Order[];
  stockItems: StockItem[];
  adminBase: string;
  t: (key: string, values?: Record<string, number>) => string;
  tc: (key: string, values?: Record<string, number>) => string;
  locale: string;
  fmt: (amount: number) => string;
  timeAgoFn: (
    date: string,
    tc: (key: string, values?: Record<string, number>) => string,
    locale: string,
  ) => string;
  onStatusChange: (orderId: string, newStatus: string) => Promise<void>;
  /** When false, hides the recent orders section */
  showOrders?: boolean;
  /** When false, hides the stock alerts section */
  showStock?: boolean;
}

// ─── Component ─────────────────────────────────────────────

export default function DashboardRecentOrders({
  recentOrders,
  stockItems,
  adminBase,
  t,
  tc,
  locale,
  fmt,
  timeAgoFn,
  onStatusChange,
  showOrders = true,
  showStock = true,
}: DashboardRecentOrdersProps) {
  // If neither section is visible, render nothing
  if (!showOrders && !showStock) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-h-0">
      {/* Recent Orders — spans full width when stock is hidden */}
      {showOrders && (
        <div
          className={`min-h-[300px] md:min-h-0 overflow-hidden bg-white border border-neutral-100 rounded-xl flex flex-col ${showStock ? 'col-span-1 md:col-span-2' : 'col-span-1 md:col-span-3'}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-base font-bold text-neutral-900">{t('recentOrders')}</h2>
                <p className="text-xs text-neutral-500">
                  {t('ordersCountLabel', { count: recentOrders.length })}
                </p>
              </div>
              {recentOrders.filter((o) => o.status === 'pending').length > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold">
                  <Clock className="w-3 h-3" />
                  {recentOrders.filter((o) => o.status === 'pending').length} {t('pendingLabel')}
                </span>
              )}
            </div>
            <Link
              href={`${adminBase}/orders`}
              className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 hover:text-[#CCFF00] transition-colors"
            >
              {t('viewAll')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {recentOrders.length > 0 ? (
            <div className="flex-1 min-h-0 overflow-auto divide-y divide-neutral-50">
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
                            {t('tableLabel')} {order.table_number}
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
                            {timeAgoFn(order.created_at, tc, locale)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Utensils className="w-3.5 h-3.5" />
                            {order.items?.reduce((s, i) => s + i.quantity, 0) || 0} {t('items')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-neutral-900">{fmt(order.total_price)}</p>
                      <div className="flex items-center gap-1 mt-2">
                        {order.status === 'pending' && (
                          <button
                            onClick={() => onStatusChange(order.id, 'preparing')}
                            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                            title={t('startPreparation')}
                          >
                            <ChefHat className="w-4 h-4" />
                          </button>
                        )}
                        {order.status === 'preparing' && (
                          <button
                            onClick={() => onStatusChange(order.id, 'ready')}
                            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                            title={t('markReady')}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {order.status === 'ready' && (
                          <button
                            onClick={() => onStatusChange(order.id, 'delivered')}
                            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
                            title={t('markDelivered')}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <Link
                          href={`${adminBase}/orders`}
                          className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200 transition-colors"
                          title={t('viewDetails')}
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
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <ShoppingBag className="w-8 h-8 text-neutral-400" />
                </div>
                <h3 className="font-semibold text-neutral-900 mb-1">{t('noOrders')}</h3>
                <p className="text-sm text-neutral-500">{t('noOrdersDescAlt')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stock Alerts — spans full width when orders section is hidden */}
      {showStock && (
        <div
          className={`overflow-hidden bg-white border border-neutral-100 rounded-xl flex flex-col ${!showOrders ? 'col-span-1 md:col-span-3' : ''}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-neutral-600" />
              <div>
                <h2 className="text-base font-bold text-neutral-900">{t('stockLive')}</h2>
                <p className="text-xs text-neutral-500">{t('stockTop10')}</p>
              </div>
            </div>
            <Link
              href={`${adminBase}/inventory`}
              className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900 hover:text-[#CCFF00] transition-colors"
            >
              {t('viewAll')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {stockItems.length > 0 ? (
            <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2">
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
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-neutral-900 truncate">{item.name}</p>
                      <span className="text-[10px] text-neutral-400 font-medium">{item.unit}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-green-500',
                          )}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          'text-sm font-black tabular-nums',
                          isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-neutral-900',
                        )}
                      >
                        {item.current_stock}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-14 h-14 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Package className="w-6 h-6 text-neutral-400" />
                </div>
                <p className="text-sm text-neutral-500">{t('noDataAvailable')}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
