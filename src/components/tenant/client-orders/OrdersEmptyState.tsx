'use client';

import { ShoppingBag, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface OrdersEmptyStateProps {
  tenantSlug: string;
  showHistory: boolean;
}

export function OrdersEmptyState({ tenantSlug, showHistory }: OrdersEmptyStateProps) {
  const t = useTranslations('tenant');

  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] text-center px-4">
      <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 bg-app-elevated">
        <ShoppingBag className="w-11 h-11 text-app-text-muted" />
      </div>
      <h2 className="mb-2 text-xl leading-[28px] font-bold text-app-text">
        {showHistory ? t('noOrdersDesc') : t('noOrders')}
      </h2>
      <p className="text-center mb-8 max-w-xs text-[13px] leading-[18px] text-app-text-secondary">
        {showHistory ? t('noOrdersBrowse') : t('noOrdersBrowse')}
      </p>
      {!showHistory && (
        <Button
          asChild
          className="h-12 px-8 rounded-xl bg-app-text text-white text-[15px] font-semibold hover:bg-black"
        >
          <Link href={`/sites/${tenantSlug}/menu`}>
            <ArrowLeft className="w-4 h-4" />
            {t('viewMenu')}
          </Link>
        </Button>
      )}
    </div>
  );
}
