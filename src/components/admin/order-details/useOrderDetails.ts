'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { actionUpdateOrderStatus } from '@/app/actions/orders';
import { useToast } from '@/components/ui/use-toast';
import type { Order, OrderStatus, Tenant, CurrencyCode } from '@/types/admin.types';
import { getStatusStyle } from '@/lib/design-tokens';
import { formatCurrency } from '@/lib/utils/currency';
import { formatCurrencyMinor } from '@/lib/utils/money';
import { printReceipt } from '@/lib/printing/receipt';
import { printKitchenTicket } from '@/lib/printing/kitchen-ticket';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import { usePermissions } from '@/hooks/usePermissions';

const COMP_CAPABLE_ROLES = ['owner', 'admin', 'manager'] as const;

interface UseOrderDetailsParams {
  order: Order;
  onClose: () => void;
  onUpdate: () => void;
  tenant?: Partial<Tenant>;
  currency: CurrencyCode;
}

export function useOrderDetails({
  order,
  onClose,
  onUpdate,
  tenant,
  currency,
}: UseOrderDetailsParams) {
  const [loading, setLoading] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const seg = useSegmentTerms();
  const locale = useLocale();
  const { toast } = useToast();
  const { role } = usePermissions();
  const canComp = (COMP_CAPABLE_ROLES as readonly string[]).includes(role);
  const isComp = order.payment_status === 'comp';

  // Transactional order/item amounts (total, subtotal, tax, tip, price_at_order)
  // are integer MINOR units -> format with fmt. Catalog prices that still live in
  // MAJOR units (a modifier's menu price) use fmtMajor.
  const fmt = (amount: number) => formatCurrencyMinor(amount, currency);
  const fmtMajor = (amount: number) => formatCurrency(amount, currency);

  const handleStatusUpdate = async (status: OrderStatus) => {
    setLoading(true);
    try {
      const result = await actionUpdateOrderStatus(order.tenant_id, order.id, status);
      if (result.error) throw new Error(result.error);
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

  const statusStyle = getStatusStyle(order.status);

  const itemCount = (order.items || []).reduce((sum, i) => sum + i.quantity, 0);

  return {
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
  };
}
