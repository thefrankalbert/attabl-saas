'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import OrderDetails from '@/components/admin/OrderDetails';
import type { Order } from '@/types/admin.types';

interface SingleOrderClientProps {
  order: Order;
}

export default function SingleOrderClient({ order: initialOrder }: SingleOrderClientProps) {
  const router = useRouter();
  const t = useTranslations('orders');
  const tc = useTranslations('common');

  const displayLabel = initialOrder.order_number || `#${initialOrder.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Compact header row */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-app-text truncate">
            {t('orderDetails')} — {displayLabel}
          </h1>
          <p className="text-xs text-app-text-muted">
            {tc('table')} {initialOrder.table_number}
          </p>
        </div>
      </div>

      <OrderDetails
        order={initialOrder}
        onClose={() => router.back()}
        onUpdate={() => router.refresh()}
      />
    </div>
  );
}
