'use client';

import { TERMINAL_STATUSES, type ClientOrdersProps } from '@/components/tenant/client-orders/types';
import { useClientOrders } from '@/components/tenant/client-orders/useClientOrders';
import { OrdersSkeleton } from '@/components/tenant/client-orders/OrdersSkeleton';
import { OrdersEmptyState } from '@/components/tenant/client-orders/OrdersEmptyState';
import { OrderReadyBanner } from '@/components/tenant/client-orders/OrderReadyBanner';
import { TerminalOrderCard } from '@/components/tenant/client-orders/TerminalOrderCard';
import { ActiveOrderCard } from '@/components/tenant/client-orders/ActiveOrderCard';

// --- Component ----------------------------------------------

export default function ClientOrders({
  tenantSlug,
  tenantId,
  currency = 'XAF',
  showHistory = false,
}: ClientOrdersProps) {
  const {
    loading,
    displayedOrders,
    handleReorder,
    showReadyBanner,
    dismissBanner,
    readyOrderNumber,
  } = useClientOrders({ tenantSlug, tenantId, currency, showHistory });

  // --- Loading state ----------------------------------------

  if (loading) {
    return <OrdersSkeleton />;
  }

  // --- Empty state -----------------------

  if (displayedOrders.length === 0) {
    return <OrdersEmptyState tenantSlug={tenantSlug} showHistory={showHistory} />;
  }

  // --- Orders history list ----------------------------------

  return (
    <div
      className="space-y-3"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Order ready banner (active mode only) */}
      {!showHistory && showReadyBanner && (
        <OrderReadyBanner readyOrderNumber={readyOrderNumber} dismissBanner={dismissBanner} />
      )}

      {displayedOrders.map((order) => {
        const isTerminal = TERMINAL_STATUSES.has(order.status);

        if (isTerminal) {
          return (
            <TerminalOrderCard
              key={order.id}
              order={order}
              tenantSlug={tenantSlug}
              currency={currency}
              onReorder={handleReorder}
            />
          );
        }

        return <ActiveOrderCard key={order.id} order={order} tenantSlug={tenantSlug} />;
      })}
    </div>
  );
}
