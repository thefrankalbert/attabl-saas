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
import { Button } from '@/components/ui/button';
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
  showOrders?: boolean;
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
  if (!showOrders && !showStock) return null;

  return (
    <div className="grid grid-cols-1 @md:grid-cols-3 gap-4 min-h-0">
      {/* Recent Orders */}
      {showOrders && (
        <div
          className={`min-h-[300px] @md:min-h-0 overflow-hidden rounded-2xl bg-app-card border border-app-border hover:border-app-border-hover transition-colors flex flex-col ${showStock ? 'col-span-1 @md:col-span-2' : 'col-span-1 @md:col-span-3'}`}
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-app-border shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-app-text uppercase tracking-wider">
                {t('recentOrders')}
              </h2>
              <span className="text-[11px] font-bold text-app-text-muted bg-app-bg px-2 py-0.5 rounded-full">
                {recentOrders.length}
              </span>
              {recentOrders.filter((o) => o.status === 'pending').length > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-status-warning-bg text-status-warning rounded-full text-[11px] font-bold">
                  <Clock className="w-3 h-3" />
                  {recentOrders.filter((o) => o.status === 'pending').length} {t('pendingLabel')}
                </span>
              )}
            </div>
            <Link
              href={`${adminBase}/orders`}
              className="flex items-center gap-1.5 text-sm font-bold text-app-text hover:text-accent transition-colors"
            >
              {t('viewAll')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {recentOrders.length > 0 ? (
            <div className="flex-1 min-h-0 overflow-auto divide-y divide-app-border">
              {recentOrders.map((order) => (
                <div key={order.id} className="px-6 py-4 hover:bg-app-bg/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-app-text font-black text-sm">
                        {order.table_number}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-app-text">
                            {t('tableLabel')} {order.table_number}
                          </h3>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="text-sm text-app-text-muted mt-0.5">
                          {order.items
                            ?.slice(0, 2)
                            .map((i) => i.name)
                            .join(', ')}
                          {order.items && order.items.length > 2 && ` +${order.items.length - 2}`}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-app-text-muted">
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
                      <p className="font-black text-app-text text-lg tabular-nums tracking-tight">
                        {fmt(order.total_price)}
                      </p>
                      <div className="flex items-center gap-1 mt-2">
                        {order.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onStatusChange(order.id, 'preparing')}
                            className="p-2.5 min-h-[44px] min-w-[44px] bg-status-info-bg text-status-info rounded-xl hover:bg-status-info-bg"
                            title={t('startPreparation')}
                          >
                            <ChefHat className="w-4 h-4" />
                          </Button>
                        )}
                        {order.status === 'preparing' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onStatusChange(order.id, 'ready')}
                            className="p-2.5 min-h-[44px] min-w-[44px] bg-status-success-bg text-status-success rounded-xl hover:bg-status-success-bg"
                            title={t('markReady')}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        )}
                        {order.status === 'ready' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onStatusChange(order.id, 'delivered')}
                            className="p-2.5 min-h-[44px] min-w-[44px] bg-app-bg text-app-text-secondary rounded-xl hover:bg-app-elevated"
                            title={t('markDelivered')}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Link
                          href={`${adminBase}/orders`}
                          className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-app-bg text-app-text-secondary rounded-xl hover:bg-app-elevated transition-colors"
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
                <div className="w-16 h-16 bg-app-bg rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ShoppingBag className="w-8 h-8 text-app-text-muted" />
                </div>
                <h3 className="font-bold text-app-text mb-1">{t('noOrders')}</h3>
                <p className="text-sm text-app-text-muted">{t('noOrdersDescAlt')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stock Alerts */}
      {showStock && (
        <div
          className={`overflow-hidden bg-app-card border border-app-border rounded-2xl hover:border-app-border-hover transition-colors flex flex-col ${!showOrders ? 'col-span-1 @md:col-span-3' : ''}`}
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-app-border shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-app-text uppercase tracking-wider">
                {t('stockLive')}
              </h2>
              <span className="text-[11px] font-bold text-app-text-muted bg-app-bg px-2 py-0.5 rounded-full">
                {stockItems.length}
              </span>
            </div>
            <Link
              href={`${adminBase}/inventory`}
              className="flex items-center gap-1.5 text-sm font-bold text-app-text hover:text-accent transition-colors"
            >
              {t('viewAll')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {stockItems.length > 0 ? (
            <div className="flex-1 min-h-0 overflow-auto p-4 space-y-2">
              {stockItems.map((item) => {
                const isOut = item.current_stock <= 0;
                const isLow = item.current_stock > 0 && item.current_stock <= item.min_stock_alert;
                const maxStock = Math.max(item.min_stock_alert * 3, item.current_stock, 1);
                const pct = Math.min((item.current_stock / maxStock) * 100, 100);

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'p-3.5 rounded-xl border transition-colors',
                      isOut
                        ? 'border-status-error/20 bg-status-error-bg'
                        : isLow
                          ? 'border-status-warning/20 bg-status-warning-bg'
                          : 'border-app-border bg-app-bg/50',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-app-text break-words">{item.name}</p>
                      <span className="text-[10px] text-app-text-muted font-semibold uppercase">
                        {item.unit}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-app-elevated rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            isOut ? 'bg-status-error' : isLow ? 'bg-status-warning' : 'bg-accent',
                          )}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          'text-sm font-black tabular-nums',
                          isOut
                            ? 'text-status-error'
                            : isLow
                              ? 'text-status-warning'
                              : 'text-app-text',
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
                <div className="w-14 h-14 bg-app-bg rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Package className="w-6 h-6 text-app-text-muted" />
                </div>
                <p className="text-sm text-app-text-muted">{t('noDataAvailable')}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
