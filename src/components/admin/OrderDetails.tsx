'use client';

import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import type { Order, Tenant, CurrencyCode } from '@/types/admin.types';
import PaymentModal from './PaymentModal';
import { useOrderDetails } from './order-details/useOrderDetails';
import { OrderInfoHeader } from './order-details/OrderInfoHeader';
import { OrderItemsList } from './order-details/OrderItemsList';
import { OrderActionsPanel } from './order-details/OrderActionsPanel';

interface OrderDetailsProps {
  order: Order;
  onClose: () => void;
  onUpdate: () => void;
  tenant?: Partial<Tenant>;
  currency?: CurrencyCode;
}

export default function OrderDetails({
  order,
  onClose,
  onUpdate,
  tenant,
  currency = 'XAF',
}: OrderDetailsProps) {
  const t = useTranslations('orders');
  const {
    loading,
    showPayment,
    setShowPayment,
    canComp,
    isComp,
    fmt,
    fmtMajor,
    handleStatusUpdate,
    handlePrintKitchen,
    handlePrintReceipt,
    displayTotal,
    tipAmount,
    hasBreakdown,
    serviceLabels,
    statusStyle,
    itemCount,
    locale,
  } = useOrderDetails({ order, onClose, onUpdate, tenant, currency });

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* -- Left: order info + scrollable items ----------- */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Static: status bar + info - compact */}
          <OrderInfoHeader
            order={order}
            isComp={isComp}
            statusStyle={statusStyle}
            displayTotal={displayTotal}
            tipAmount={tipAmount}
            fmt={fmt}
            locale={locale}
            serviceLabels={serviceLabels}
          />

          {/* Scrollable: items list only */}
          <OrderItemsList
            order={order}
            itemCount={itemCount}
            hasBreakdown={hasBreakdown}
            displayTotal={displayTotal}
            tipAmount={tipAmount}
            fmt={fmt}
            fmtMajor={fmtMajor}
          />
        </div>

        {/* -- Right: static actions panel ------------------- */}
        <OrderActionsPanel
          order={order}
          loading={loading}
          isComp={isComp}
          canComp={canComp}
          currency={currency}
          onUpdate={onUpdate}
          onStatusUpdate={handleStatusUpdate}
          onShowPayment={() => setShowPayment(true)}
          onPrintKitchen={handlePrintKitchen}
          onPrintReceipt={handlePrintReceipt}
        />

        {/* Warnings */}
        {order.status !== 'ready' && order.status !== 'delivered' && (
          <div className="flex items-center gap-2 p-4 border border-[var(--border)] text-[var(--warning)] rounded-xl text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {t('warningReadyBeforeCheckout')}
          </div>
        )}
      </div>

      {showPayment && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          order={order}
          canComp={canComp}
          onSuccess={() => {
            handleStatusUpdate('delivered');
            setShowPayment(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
