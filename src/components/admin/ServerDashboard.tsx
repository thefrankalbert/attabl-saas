'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useAssignments } from '@/hooks/queries/useAssignments';
import { useOrders } from '@/hooks/queries/useOrders';
import { useReleaseAssignment, useClaimOrder } from '@/hooks/mutations/useAssignment';
import { UserCheck, ShoppingCart, LogOut, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/currency';
import { createClient } from '@/lib/supabase/client';
import type { Order, CurrencyCode } from '@/types/admin.types';

interface Props {
  tenantId: string;
  currentServerId: string;
  currency?: CurrencyCode;
}

export default function ServerDashboard({ tenantId, currentServerId, currency = 'XAF' }: Props) {
  const t = useTranslations('service');
  const { data: allAssignments = [] } = useAssignments(tenantId);
  const { data: orders = [] } = useOrders(tenantId);
  const releaseAssignment = useReleaseAssignment(tenantId);
  const claimOrder = useClaimOrder(tenantId);

  const [expandedTableId, setExpandedTableId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`server-orders-realtime-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, queryClient]);

  const myAssignments = allAssignments.filter((a) => a.server_id === currentServerId);
  const myOrders = orders.filter(
    (o: Order) =>
      o.server_id === currentServerId && o.status !== 'delivered' && o.status !== 'cancelled',
  );
  const unassignedOrders = orders.filter(
    (o: Order) => !o.server_id && o.status !== 'delivered' && o.status !== 'cancelled',
  );

  return (
    <div className="space-y-6">
      {/* My Tables */}
      <div>
        <h2 className="text-lg font-semibold text-app-text mb-3 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-emerald-600" />
          {t('myTables', { count: myAssignments.length })}
        </h2>
        {myAssignments.length === 0 ? (
          <p className="text-sm text-app-text-secondary">{t('noTablesAssigned')}</p>
        ) : (
          <div className="grid grid-cols-1 @sm:grid-cols-2 @md:grid-cols-2 @lg:grid-cols-3 gap-3">
            {myAssignments.map((assignment) => {
              const tableOrders = myOrders.filter((o: Order) => o.table_id === assignment.table_id);
              const isExpanded = expandedTableId === assignment.table_id;
              return (
                <div
                  key={assignment.id}
                  className="rounded-lg border border-app-border bg-app-card overflow-hidden"
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-app-bg transition-colors touch-manipulation"
                    onClick={() => setExpandedTableId(isExpanded ? null : assignment.table_id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-app-text">
                        {assignment.table?.display_name ??
                          assignment.table?.table_number ??
                          'Table'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          releaseAssignment.mutate(assignment.id);
                        }}
                        className="flex items-center gap-1 text-xs text-app-text-secondary hover:text-red-500 transition-colors min-h-[44px] min-w-[44px] justify-center touch-manipulation"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        {t('release')}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-sm text-app-text-secondary">
                      <span>{t('activeOrders', { count: tableOrders.length })}</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </div>

                  {isExpanded && tableOrders.length > 0 && (
                    <div className="border-t border-app-border bg-app-bg p-3 space-y-2">
                      {tableOrders.map((order: Order) => (
                        <div
                          key={order.id}
                          className="bg-app-card rounded-lg p-3 border border-app-border"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-app-text-secondary uppercase">
                              #{order.id.slice(0, 8)}
                            </span>
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                order.status === 'pending'
                                  ? 'bg-amber-500/10 text-amber-500'
                                  : order.status === 'preparing'
                                    ? 'bg-purple-500/10 text-purple-500'
                                    : order.status === 'ready'
                                      ? 'bg-emerald-500/10 text-emerald-500'
                                      : 'bg-app-elevated text-app-text-secondary'
                              }`}
                            >
                              {order.status}
                            </span>
                          </div>
                          <div className="text-sm text-app-text">
                            {formatCurrency(order.total_price + (order.tip_amount || 0), currency)}
                            <span className="text-app-text-muted ml-2">
                              ({order.items?.length ?? 0}{' '}
                              {t('items', { count: order.items?.length ?? 0 })})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isExpanded && tableOrders.length === 0 && (
                    <div className="border-t border-app-border bg-app-bg p-4 text-center text-sm text-app-text-muted">
                      {t('noActiveOrders')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unassigned Orders */}
      <div>
        <h2 className="text-lg font-semibold text-app-text mb-3 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-app-text-secondary" />
          {t('unassignedOrders', { count: unassignedOrders.length })}
        </h2>
        {unassignedOrders.length === 0 ? (
          <p className="text-sm text-app-text-secondary">{t('allOrdersAssigned')}</p>
        ) : (
          <div className="grid grid-cols-1 @sm:grid-cols-2 @md:grid-cols-2 @lg:grid-cols-3 gap-3">
            {unassignedOrders.map((order: Order) => (
              <div key={order.id} className="rounded-lg border border-app-border bg-app-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-app-text">
                    {order.table_number ?? ' - '}
                  </span>
                  <span className="text-xs text-app-text-secondary">
                    {t('items', { count: order.items?.length ?? 0 })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-app-text">
                    {formatCurrency(order.total_price + (order.tip_amount || 0), currency)}
                  </span>
                  <button
                    onClick={() =>
                      claimOrder.mutate({ orderId: order.id, serverId: currentServerId })
                    }
                    className="rounded-lg bg-app-text px-3 py-1 text-xs font-semibold text-accent-text hover:bg-app-text transition-colors"
                  >
                    {t('claimOrder')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
