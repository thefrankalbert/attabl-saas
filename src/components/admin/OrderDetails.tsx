'use client';

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
  const {
    loading,
    showPayment,
    setShowPayment,
    canPay,
    canComp,
    isComp,
    fmt,
    fmtMajor,
    handleStatusUpdate,
    handlePrintKitchen,
    handlePrintReceipt,
    handlePrintInvoice,
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
      <div className="flex flex-col lg:flex-row gap-4 lg:flex-1 lg:min-h-0">
        {/* -- Left: order info + scrollable items ----------- */}
        <div className="lg:flex-1 flex flex-col lg:min-h-0 min-w-0">
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
          canPay={canPay}
          canComp={canComp}
          currency={currency}
          onUpdate={onUpdate}
          onStatusUpdate={handleStatusUpdate}
          onShowPayment={() => setShowPayment(true)}
          onPrintKitchen={handlePrintKitchen}
          onPrintReceipt={handlePrintReceipt}
          onPrintInvoice={handlePrintInvoice}
        />
      </div>

      {showPayment && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          order={order}
          canComp={canComp}
          onSuccess={() => {
            // Une commande deja servie n'a pas a repasser par 'servie'.
            if (order.status === 'delivered') onUpdate();
            else handleStatusUpdate('delivered');
            setShowPayment(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
