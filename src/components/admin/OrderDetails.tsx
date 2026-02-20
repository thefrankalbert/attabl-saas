'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Clock, Printer, Receipt, CreditCard, AlertCircle, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { Order, OrderStatus, Tenant, CurrencyCode } from '@/types/admin.types';
import { formatCurrency } from '@/lib/utils/currency';
import { printReceipt } from '@/lib/printing/receipt';
import { printKitchenTicket } from '@/lib/printing/kitchen-ticket';
import PaymentModal from './PaymentModal';

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
  const [loading, setLoading] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const ta = useTranslations('admin');
  const locale = useLocale();
  const { toast } = useToast();
  const supabase = createClient();

  const fmt = (amount: number) => formatCurrency(amount, currency);

  const handleStatusUpdate = async (status: OrderStatus) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('orders').update({ status }).eq('id', order.id);
      if (error) throw error;
      toast({ title: t('statusUpdated') });
      onUpdate();
      if (status === 'delivered') onClose();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handlePrintKitchen = () => {
    printKitchenTicket(order);
    toast({ title: t('kitchenTicketPrinted') });
  };

  const handlePrintReceipt = () => {
    const tenantForPrint = {
      name: tenant?.name || 'Restaurant',
      address: tenant?.address || '',
      phone: tenant?.phone || '',
      currency: currency,
    } as Tenant;
    printReceipt(order, tenantForPrint);
    toast({ title: t('clientReceiptPrinted') });
  };

  // Determine total to display
  const displayTotal = order.total || order.total_price || 0;
  const hasBreakdown =
    (order.subtotal && order.subtotal > 0) || (order.tax_amount && order.tax_amount > 0);

  // Service type labels
  const serviceLabels: Record<string, string> = {
    dine_in: t('serviceDineIn'),
    takeaway: t('serviceTakeaway'),
    delivery: t('serviceDelivery'),
    room_service: t('serviceRoom'),
  };

  return (
    <>
      <div className="space-y-6 pt-2">
        {/* Header Info */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-neutral-900">
              {order.order_number || t('tableNumber', { number: order.table_number })}
            </h2>
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Clock className="w-4 h-4" />
              {new Date(order.created_at).toLocaleString(locale)}
            </div>
            {order.service_type && order.service_type !== 'dine_in' && (
              <Badge variant="outline" className="mt-1">
                {serviceLabels[order.service_type] || order.service_type}
                {order.room_number ? ` ${t('roomNumber', { number: order.room_number })}` : ''}
              </Badge>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-neutral-500 uppercase">{tc('total')}</p>
            <p className="text-2xl font-bold text-neutral-900">{fmt(displayTotal)}</p>
          </div>
        </div>

        {/* Server */}
        <div className="border border-neutral-100 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-neutral-500">
              <User className="w-4 h-4" />
              {t('serverLabel')}
            </span>
            <span className="text-sm font-medium text-neutral-900">
              {order.server?.full_name ?? ta('unassigned')}
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="border border-neutral-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-neutral-50">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              {t('orderDetails')}
            </p>
          </div>
          <div className="h-[280px] overflow-y-auto p-4 custom-scrollbar">
            <div className="space-y-3">
              {(order.items || []).map((item, i) => (
                <div key={i} className="flex justify-between items-start py-2">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 bg-neutral-100 rounded flex items-center justify-center text-xs font-bold text-neutral-900">
                      {item.quantity}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-neutral-900">{item.name}</p>
                      {item.notes && (
                        <p className="text-xs text-neutral-500 mt-0.5">{item.notes}</p>
                      )}
                      {item.customer_notes && (
                        <p className="text-xs text-amber-600 mt-0.5 bg-amber-50 px-1.5 py-0.5 rounded">
                          {item.customer_notes}
                        </p>
                      )}
                      {item.modifiers &&
                        Array.isArray(item.modifiers) &&
                        item.modifiers.length > 0 && (
                          <div className="mt-0.5">
                            {item.modifiers.map((m, mi) => (
                              <p key={mi} className="text-xs text-blue-600">
                                + {m.name} ({fmt(m.price)})
                              </p>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                  <p className="font-medium text-sm text-neutral-900">
                    {fmt(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Price Breakdown */}
        {hasBreakdown && (
          <div className="border border-neutral-100 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-neutral-500">
              <span>{t('subtotal')}</span>
              <span>{fmt(order.subtotal || 0)}</span>
            </div>
            {(order.tax_amount ?? 0) > 0 && (
              <div className="flex justify-between text-sm text-neutral-500">
                <span>{t('vat')}</span>
                <span>{fmt(order.tax_amount!)}</span>
              </div>
            )}
            {(order.service_charge_amount ?? 0) > 0 && (
              <div className="flex justify-between text-sm text-neutral-500">
                <span>{t('serviceCharge')}</span>
                <span>{fmt(order.service_charge_amount!)}</span>
              </div>
            )}
            {(order.discount_amount ?? 0) > 0 && (
              <div className="flex justify-between text-sm text-red-500">
                <span>{t('discountLabel')}</span>
                <span>-{fmt(order.discount_amount!)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base text-neutral-900 border-t border-neutral-100 pt-2">
              <span>{tc('total')}</span>
              <span>{fmt(displayTotal)}</span>
            </div>
          </div>
        )}

        {/* Status Actions */}
        {order.status !== 'delivered' && order.status !== 'cancelled' && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={() => handleStatusUpdate('pending')}
              disabled={loading || order.status === 'pending'}
            >
              {t('statusButtonPending')}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleStatusUpdate('preparing')}
              disabled={loading || order.status === 'preparing'}
            >
              {t('statusButtonPreparing')}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleStatusUpdate('ready')}
              disabled={loading || order.status === 'ready'}
            >
              {t('statusButtonReady')}
            </Button>
            <Button
              onClick={() => setShowPayment(true)}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CreditCard className="w-4 h-4 mr-2" /> {t('statusButtonCheckout')}
            </Button>
          </div>
        )}

        {/* Print Actions */}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={handlePrintKitchen}>
            <Printer className="w-4 h-4 mr-2" /> {t('printKitchenTicket')}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={handlePrintReceipt}
            disabled={order.status !== 'ready' && order.status !== 'delivered'}
          >
            <Receipt className="w-4 h-4 mr-2" /> {t('printClientReceipt')}
          </Button>
        </div>

        {/* Warnings */}
        {order.status !== 'ready' && order.status !== 'delivered' && (
          <div className="flex items-center gap-2 p-4 border border-amber-200 bg-amber-50 text-amber-800 rounded-xl text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {t('warningReadyBeforeCheckout')}
          </div>
        )}
      </div>

      <PaymentModal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        order={order}
        onSuccess={() => {
          handleStatusUpdate('delivered');
          setShowPayment(false);
          onClose();
        }}
      />
    </>
  );
}
