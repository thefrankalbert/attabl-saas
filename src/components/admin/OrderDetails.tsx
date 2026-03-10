'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Clock,
  Printer,
  Receipt,
  CreditCard,
  AlertCircle,
  User,
  MessageSquare,
  Phone,
  MapPin,
  Hash,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { Order, OrderStatus, Tenant, CurrencyCode } from '@/types/admin.types';
import { STATUS_STYLES } from '@/lib/design-tokens';
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
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', order.id)
        .eq('tenant_id', order.tenant_id);
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

  const displayTotal = order.total || order.total_price || 0;
  const hasBreakdown =
    (order.subtotal && order.subtotal > 0) || (order.tax_amount && order.tax_amount > 0);

  const serviceLabels: Record<string, string> = {
    dine_in: t('serviceDineIn'),
    takeaway: t('serviceTakeaway'),
    delivery: t('serviceDelivery'),
    room_service: t('serviceRoom'),
  };

  const statusStyle =
    STATUS_STYLES[order.status as keyof typeof STATUS_STYLES] || STATUS_STYLES.pending;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column: order info ─────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Status + time + total bar */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-app-border p-4">
            <div className="flex items-center gap-3">
              <Badge className={`${statusStyle.bg} ${statusStyle.text} border-0`}>
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-1.5 ${statusStyle.dot} ${statusStyle.pulse ? 'animate-pulse' : ''}`}
                />
                {t(
                  `status${order.status.charAt(0).toUpperCase()}${order.status.slice(1)}Card` as Parameters<
                    typeof t
                  >[0],
                )}
              </Badge>
              {order.service_type && order.service_type !== 'dine_in' && (
                <Badge variant="outline" className="text-xs">
                  {serviceLabels[order.service_type] || order.service_type}
                </Badge>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-app-text">{fmt(displayTotal)}</p>
              <div className="flex items-center gap-1 text-xs text-app-text-muted justify-end mt-0.5">
                <Clock className="w-3 h-3" />
                {new Date(order.created_at).toLocaleString(locale)}
              </div>
            </div>
          </div>

          {/* Info grid: server, customer, table, notes */}
          <div className="grid grid-cols-2 gap-3">
            {/* Server */}
            <InfoCell
              icon={<User className="w-4 h-4" />}
              label={t('serverLabel')}
              value={order.server?.full_name ?? ta('unassigned')}
            />
            {/* Table */}
            <InfoCell
              icon={<Hash className="w-4 h-4" />}
              label={tc('table')}
              value={order.table_number}
            />
            {/* Customer */}
            {(order.customer_name || order.customer_phone) && (
              <InfoCell
                icon={
                  order.customer_phone ? (
                    <Phone className="w-4 h-4" />
                  ) : (
                    <User className="w-4 h-4" />
                  )
                }
                label={t('customerLabel')}
                value={[order.customer_name, order.customer_phone].filter(Boolean).join(' · ')}
              />
            )}
            {/* Room / delivery */}
            {order.room_number && (
              <InfoCell
                icon={<MapPin className="w-4 h-4" />}
                label={t('serviceRoom')}
                value={order.room_number}
              />
            )}
          </div>

          {/* Order-level notes */}
          {order.notes && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <MessageSquare className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-400">{order.notes}</p>
            </div>
          )}

          {/* Items list */}
          <div className="rounded-xl border border-app-border overflow-hidden">
            <div className="px-4 py-2.5 bg-app-bg border-b border-app-border flex items-center justify-between">
              <p className="text-xs font-medium text-app-text-secondary uppercase tracking-wider">
                {t('orderDetails')}
              </p>
              <p className="text-xs text-app-text-muted">
                {(order.items || []).reduce((sum, i) => sum + i.quantity, 0)} {tc('items')}
              </p>
            </div>
            <div className="max-h-[360px] overflow-y-auto divide-y divide-app-border">
              {(order.items || []).map((item, i) => (
                <div key={i} className="flex justify-between items-start px-4 py-3">
                  <div className="flex gap-3 min-w-0 flex-1">
                    <div className="w-7 h-7 bg-app-elevated rounded-lg flex items-center justify-center text-xs font-bold text-app-text shrink-0">
                      {item.quantity}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-app-text">{item.name}</p>
                      {item.customer_notes && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 bg-amber-500/10 px-2 py-0.5 rounded inline-block">
                          {item.customer_notes}
                        </p>
                      )}
                      {item.notes && !item.customer_notes && (
                        <p className="text-xs text-app-text-muted mt-0.5">{item.notes}</p>
                      )}
                      {item.modifiers &&
                        Array.isArray(item.modifiers) &&
                        item.modifiers.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.modifiers.map((m, mi) => (
                              <p key={mi} className="text-xs text-blue-600 dark:text-blue-400">
                                + {m.name} ({fmt(m.price)})
                              </p>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                  <p className="font-medium text-sm text-app-text shrink-0 ml-3">
                    {fmt(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Price Breakdown */}
          {hasBreakdown && (
            <div className="rounded-xl border border-app-border p-4 space-y-1.5">
              <div className="flex justify-between text-sm text-app-text-secondary">
                <span>{t('subtotal')}</span>
                <span>{fmt(order.subtotal || 0)}</span>
              </div>
              {(order.tax_amount ?? 0) > 0 && (
                <div className="flex justify-between text-sm text-app-text-secondary">
                  <span>{t('vat')}</span>
                  <span>{fmt(order.tax_amount!)}</span>
                </div>
              )}
              {(order.service_charge_amount ?? 0) > 0 && (
                <div className="flex justify-between text-sm text-app-text-secondary">
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
              <div className="flex justify-between font-bold text-base text-app-text border-t border-app-border pt-2 mt-2">
                <span>{tc('total')}</span>
                <span>{fmt(displayTotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: actions ───────────────────────── */}
        <div className="space-y-4">
          {/* Status Actions */}
          {order.status !== 'delivered' && order.status !== 'cancelled' && (
            <div className="rounded-xl border border-app-border p-4 space-y-3">
              <p className="text-xs font-medium text-app-text-secondary uppercase tracking-wider">
                {t('statusLabel')}
              </p>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusUpdate('pending')}
                  disabled={loading || order.status === 'pending'}
                  className="justify-start"
                >
                  <span className="w-2 h-2 rounded-full bg-status-warning mr-2" />
                  {t('statusButtonPending')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusUpdate('preparing')}
                  disabled={loading || order.status === 'preparing'}
                  className="justify-start"
                >
                  <span className="w-2 h-2 rounded-full bg-status-warning mr-2" />
                  {t('statusButtonPreparing')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusUpdate('ready')}
                  disabled={loading || order.status === 'ready'}
                  className="justify-start"
                >
                  <span className="w-2 h-2 rounded-full bg-status-success mr-2" />
                  {t('statusButtonReady')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowPayment(true)}
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CreditCard className="w-4 h-4 mr-2" /> {t('statusButtonCheckout')}
                </Button>
              </div>

              {order.status !== 'ready' && (
                <div className="flex items-start gap-2 p-2.5 border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 rounded-lg text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{t('warningReadyBeforeCheckout')}</span>
                </div>
              )}
            </div>
          )}

          {/* Print Actions */}
          <div className="rounded-xl border border-app-border p-4 space-y-3">
            <p className="text-xs font-medium text-app-text-secondary uppercase tracking-wider">
              {t('printLabel')}
            </p>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="secondary" size="sm" onClick={handlePrintKitchen}>
                <Printer className="w-4 h-4 mr-2" /> {t('printKitchenTicket')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePrintReceipt}
                disabled={order.status !== 'ready' && order.status !== 'delivered'}
              >
                <Receipt className="w-4 h-4 mr-2" /> {t('printClientReceipt')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showPayment && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          order={order}
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

/* ── Small info cell component ────────────────────────── */
function InfoCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-app-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-app-text-muted mb-1">
        {icon}
        {label}
      </div>
      <p className="text-sm font-medium text-app-text truncate">{value}</p>
    </div>
  );
}
