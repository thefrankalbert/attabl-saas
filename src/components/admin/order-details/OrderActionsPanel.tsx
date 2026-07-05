'use client';

import { useTranslations } from 'next-intl';
import { Printer, Receipt, CreditCard, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Order, OrderStatus, CurrencyCode } from '@/types/admin.types';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import OrderPaymentPanel from '../OrderPaymentPanel';

interface OrderActionsPanelProps {
  order: Order;
  loading: boolean;
  isComp: boolean;
  canComp: boolean;
  currency: CurrencyCode;
  onUpdate: () => void;
  onStatusUpdate: (status: OrderStatus) => void;
  onShowPayment: () => void;
  onPrintKitchen: () => void;
  onPrintReceipt: () => void;
}

export function OrderActionsPanel({
  order,
  loading,
  isComp,
  canComp,
  currency,
  onUpdate,
  onStatusUpdate,
  onShowPayment,
  onPrintKitchen,
  onPrintReceipt,
}: OrderActionsPanelProps) {
  const t = useTranslations('orders');
  const seg = useSegmentTerms();

  return (
    <div className="lg:w-56 shrink-0 space-y-3">
      {/* Status Actions */}
      {order.status !== 'delivered' && order.status !== 'cancelled' && (
        <div className="rounded-xl border border-app-border p-3 space-y-2">
          <p className="text-[10px] font-medium text-app-text-secondary uppercase tracking-wider">
            {t('statusLabel')}
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatusUpdate('pending')}
              disabled={loading || order.status === 'pending'}
              className="justify-start h-8 text-xs"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-status-warning mr-1.5" />
              {t('statusButtonPending')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatusUpdate('preparing')}
              disabled={loading || order.status === 'preparing'}
              className="justify-start h-8 text-xs"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-status-warning mr-1.5" />
              {t('statusButtonPreparing')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatusUpdate('ready')}
              disabled={loading || order.status === 'ready'}
              className="justify-start h-8 text-xs"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-status-success mr-1.5" />
              {t('statusButtonReady')}
            </Button>
            {!isComp && (
              <Button
                size="sm"
                onClick={onShowPayment}
                disabled={loading}
                className="bg-status-success hover:bg-status-success/90 text-accent-text h-8 text-xs"
              >
                <CreditCard className="w-3.5 h-3.5 mr-1.5" /> {t('statusButtonCheckout')}
              </Button>
            )}
          </div>

          {order.status !== 'ready' && (
            <p className="text-[10px] text-status-warning flex items-start gap-1">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
              {t('warningReadyBeforeCheckout')}
            </p>
          )}
        </div>
      )}

      {/* Print */}
      <div className="rounded-xl border border-app-border p-3 space-y-2">
        <p className="text-[10px] font-medium text-app-text-secondary uppercase tracking-wider">
          {t('printLabel')}
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          <Button variant="secondary" size="sm" onClick={onPrintKitchen} className="h-8 text-xs">
            <Printer className="w-3.5 h-3.5 mr-1.5" /> {seg.printProductionTicket}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onPrintReceipt}
            disabled={order.status !== 'ready' && order.status !== 'delivered'}
            className="h-8 text-xs"
          >
            <Receipt className="w-3.5 h-3.5 mr-1.5" /> {t('printClientReceipt')}
          </Button>
        </div>
      </div>

      {/* Payment ledger: split/partial tenders + refund (audit H2/H8) */}
      <OrderPaymentPanel
        tenantId={order.tenant_id}
        orderId={order.id}
        currency={currency}
        canComp={canComp}
        onUpdate={onUpdate}
      />
    </div>
  );
}
