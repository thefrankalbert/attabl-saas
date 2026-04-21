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
import { createOrderService } from '@/services/order.service';
import { useToast } from '@/components/ui/use-toast';
import type { Order, OrderStatus, Tenant, CurrencyCode } from '@/types/admin.types';
import { STATUS_STYLES } from '@/lib/design-tokens';
import { formatCurrency } from '@/lib/utils/currency';
import { printReceipt } from '@/lib/printing/receipt';
import { printKitchenTicket } from '@/lib/printing/kitchen-ticket';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
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
  const seg = useSegmentTerms();
  const locale = useLocale();
  const { toast } = useToast();

  const fmt = (amount: number) => formatCurrency(amount, currency);

  const handleStatusUpdate = async (status: OrderStatus) => {
    setLoading(true);
    try {
      const service = createOrderService(createClient());
      await service.updateStatus(order.id, order.tenant_id, status);
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
    toast({ title: seg.productionTicketPrinted });
  };

  const handlePrintReceipt = () => {
    const tenantForPrint = {
      name: tenant?.name || 'Restaurant',
      slug: tenant?.slug || '',
      address: tenant?.address || '',
      phone: tenant?.phone || '',
      currency: currency,
      logo_url: tenant?.logo_url || '',
      primary_color: tenant?.primary_color || '#18181b',
    } as Tenant;
    printReceipt(order, tenantForPrint);
    toast({ title: t('clientReceiptPrinted') });
  };

  const displayTotal = order.total || order.total_price || 0;
  const tipAmount = order.tip_amount ?? 0;
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

  const itemCount = (order.items || []).reduce((sum, i) => sum + i.quantity, 0);

  return (
    <>
      <div className="flex flex-col @md:flex-row @lg:flex-row gap-4 flex-1 min-h-0">
        {/* ── Left: order info + scrollable items ─────────── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Static: status bar + info - compact */}
          <div className="shrink-0 space-y-3 mb-3">
            {/* Status + total + time - single compact row */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className={`${statusStyle.bg} ${statusStyle.text} border-0 text-xs`}>
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${statusStyle.dot} ${statusStyle.pulse ? 'animate-pulse' : ''}`}
                />
                {t(
                  `status${order.status.charAt(0).toUpperCase()}${order.status.slice(1)}Card` as Parameters<
                    typeof t
                  >[0],
                )}
              </Badge>
              {order.service_type && order.service_type !== 'dine_in' && (
                <Badge variant="outline" className="text-[10px]">
                  {serviceLabels[order.service_type] || order.service_type}
                </Badge>
              )}
              <span className="text-lg font-bold text-app-text ml-auto">
                {fmt(displayTotal + tipAmount)}
              </span>
              {tipAmount > 0 && (
                <span className="text-[10px] text-emerald-500 font-medium">
                  +{fmt(tipAmount)} {ta('tipLabel')}
                </span>
              )}
              <span className="flex items-center gap-1 text-[10px] text-app-text-muted">
                <Clock className="w-3 h-3" />
                {new Date(order.created_at).toLocaleString(locale)}
              </span>
            </div>

            {/* Info row - inline chips */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <InfoChip icon={<Hash className="w-3 h-3" />} value={order.table_number} />
              <InfoChip
                icon={<User className="w-3 h-3" />}
                label={t('serverLabel')}
                value={order.server?.full_name ?? ta('unassigned')}
              />
              {(order.customer_name || order.customer_phone) && (
                <InfoChip
                  icon={
                    order.customer_phone ? (
                      <Phone className="w-3 h-3" />
                    ) : (
                      <User className="w-3 h-3" />
                    )
                  }
                  value={[order.customer_name, order.customer_phone].filter(Boolean).join(' · ')}
                />
              )}
              {order.room_number && (
                <InfoChip icon={<MapPin className="w-3 h-3" />} value={order.room_number} />
              )}
            </div>

            {/* Notes */}
            {order.notes && (
              <div className="flex items-start gap-1.5 rounded-lg border border-status-warning/20 bg-status-warning-bg px-2.5 py-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-status-warning shrink-0 mt-0.5" />
                <p className="text-xs text-status-warning">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Scrollable: items list only */}
          <div className="rounded-xl border border-app-border overflow-hidden flex flex-col min-h-0 flex-1">
            <div className="px-3 py-2 bg-app-bg border-b border-app-border flex items-center justify-between shrink-0">
              <p className="text-[10px] font-medium text-app-text-secondary uppercase tracking-wider">
                {t('orderDetails')}
              </p>
              <p className="text-[10px] text-app-text-muted">
                {itemCount} {tc('items')}
              </p>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-app-border">
              {(order.items || []).map((item, i) => (
                <div key={i} className="flex justify-between items-start px-3 py-2">
                  <div className="flex gap-2 min-w-0 flex-1">
                    <div className="w-5 h-5 bg-app-elevated rounded flex items-center justify-center text-[10px] font-bold text-app-text shrink-0 mt-0.5">
                      {item.quantity}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-xs text-app-text">{item.name}</p>
                      {item.customer_notes && (
                        <p className="text-[10px] text-status-warning mt-0.5 bg-status-warning-bg px-1.5 py-0.5 rounded inline-block">
                          {item.customer_notes}
                        </p>
                      )}
                      {item.notes && !item.customer_notes && (
                        <p className="text-[10px] text-app-text-muted mt-0.5">{item.notes}</p>
                      )}
                      {item.modifiers &&
                        Array.isArray(item.modifiers) &&
                        item.modifiers.length > 0 && (
                          <div className="mt-0.5">
                            {item.modifiers.map((m, mi) => (
                              <p key={mi} className="text-[10px] text-status-info">
                                + {m.name} ({fmt(m.price)})
                              </p>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                  <p className="font-medium text-sm text-app-text">
                    {fmt(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            {/* Price breakdown inside the items card */}
            {hasBreakdown && (
              <div className="border-t border-app-border px-3 py-2 space-y-1 shrink-0 bg-app-bg">
                <div className="flex justify-between text-[11px] text-app-text-secondary">
                  <span>{t('subtotal')}</span>
                  <span>{fmt(order.subtotal || 0)}</span>
                </div>
                {(order.tax_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-[11px] text-app-text-secondary">
                    <span>{t('vat')}</span>
                    <span>{fmt(order.tax_amount!)}</span>
                  </div>
                )}
                {(order.service_charge_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-[11px] text-app-text-secondary">
                    <span>{t('serviceCharge')}</span>
                    <span>{fmt(order.service_charge_amount!)}</span>
                  </div>
                )}
                {(order.discount_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-[11px] text-status-error">
                    <span>{t('discountLabel')}</span>
                    <span>-{fmt(order.discount_amount!)}</span>
                  </div>
                )}
                {tipAmount > 0 && (
                  <div className="flex justify-between text-[11px] text-emerald-500">
                    <span>{ta('tipLabel')}</span>
                    <span>+{fmt(tipAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-xs text-app-text border-t border-app-border pt-1.5 mt-1">
                  <span>{tc('total')}</span>
                  <span>{fmt(displayTotal + tipAmount)}</span>
                </div>
              </div>
            )}

            {/* Tip-only footer when no full breakdown exists but tip is present */}
            {!hasBreakdown && tipAmount > 0 && (
              <div className="border-t border-app-border px-3 py-2 space-y-1 shrink-0 bg-app-bg">
                <div className="flex justify-between text-[11px] text-emerald-500">
                  <span>{ta('tipLabel')}</span>
                  <span>+{fmt(tipAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-xs text-app-text border-t border-app-border pt-1.5 mt-1">
                  <span>{tc('total')}</span>
                  <span>{fmt(displayTotal + tipAmount)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: static actions panel ─────────────────── */}
        <div className="@lg:w-56 shrink-0 space-y-3">
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
                  onClick={() => handleStatusUpdate('pending')}
                  disabled={loading || order.status === 'pending'}
                  className="justify-start h-8 text-xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-status-warning mr-1.5" />
                  {t('statusButtonPending')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusUpdate('preparing')}
                  disabled={loading || order.status === 'preparing'}
                  className="justify-start h-8 text-xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-status-warning mr-1.5" />
                  {t('statusButtonPreparing')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusUpdate('ready')}
                  disabled={loading || order.status === 'ready'}
                  className="justify-start h-8 text-xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-status-success mr-1.5" />
                  {t('statusButtonReady')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowPayment(true)}
                  disabled={loading}
                  className="bg-status-success hover:bg-status-success/90 text-accent-text h-8 text-xs"
                >
                  <CreditCard className="w-3.5 h-3.5 mr-1.5" /> {t('statusButtonCheckout')}
                </Button>
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
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePrintKitchen}
                className="h-8 text-xs"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" /> {seg.printProductionTicket}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePrintReceipt}
                disabled={order.status !== 'ready' && order.status !== 'delivered'}
                className="h-8 text-xs"
              >
                <Receipt className="w-3.5 h-3.5 mr-1.5" /> {t('printClientReceipt')}
              </Button>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {order.status !== 'ready' && order.status !== 'delivered' && (
          <div className="flex items-center gap-2 p-4 border border-amber-500/20 bg-amber-500/10 text-amber-500 rounded-xl text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {t('warningReadyBeforeCheckout')}
          </div>
        )}
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

/* ── Compact info chip ────────────────────────────────── */
function InfoChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label?: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-bg px-2 py-0.5 text-app-text">
      {icon}
      {label && <span className="text-app-text-muted">{label}:</span>}
      <span className="font-medium">{value}</span>
    </span>
  );
}
