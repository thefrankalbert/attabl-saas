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

  const displayLabel = initialOrder.order_number || `#${initialOrder.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Inline header — same line as breadcrumb text */}
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
          {t('orderDetails')} — {displayLabel}
        </h1>
      </div>

      <OrderDetails
        order={initialOrder}
        onClose={() => router.back()}
        onUpdate={() => router.refresh()}
      />
    </div>
  );
}
