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

  const displayLabel = orderDisplayLabel(initialOrder);

  return (
    // Fixed-height split view from lg only: below it the panels stack and the
    // page must scroll in main#main-content, or the items list collapses to 0.
    <div className="flex flex-col lg:h-full lg:overflow-hidden">
      {/* Inline header - same line as breadcrumb text */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-7 w-7 p-0"
          onClick={() => router.back()}
        >
          <ChevronLeft className="w-4 h-4" />
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
