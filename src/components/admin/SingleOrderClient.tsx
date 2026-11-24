'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import OrderDetails from '@/components/admin/OrderDetails';
import type { Order, CurrencyCode } from '@/types/admin.types';
import { orderDisplayLabel } from '@/components/admin/orders/order-display-label';

interface SingleOrderClientProps {
  order: Order;
  currency?: CurrencyCode;
}

export default function SingleOrderClient({
  order: initialOrder,
  currency = 'XAF',
}: SingleOrderClientProps) {
  const router = useRouter();
  const t = useTranslations('orders');
  const tc = useTranslations('common');

  const displayLabel = orderDisplayLabel(initialOrder);

  return (
    // Audit B129: no fixed-height split view. The actions column is taller than
    // a 768 px screen; locked to the viewport it scrolled on its own (cancel
    // button out of sight) and nested a second scroller. The page scrolls in
    // main#main-content only, at every width.
    <div className="flex flex-col">
      {/* Inline header - same line as breadcrumb text */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-7 w-7 p-0"
          onClick={() => router.back()}
          aria-label={tc('back')}
        >
          <ChevronLeft className="w-4 h-4" aria-hidden />
        </Button>
        <h1 className="text-sm font-semibold text-app-text break-words">
          {t('orderDetails')} - {displayLabel}
        </h1>
      </div>

      <OrderDetails
        order={initialOrder}
        currency={currency}
        onClose={() => router.back()}
        onUpdate={() => router.refresh()}
      />
    </div>
  );
}
