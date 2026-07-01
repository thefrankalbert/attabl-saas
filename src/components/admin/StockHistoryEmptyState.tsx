'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PackageOpen, PackagePlus, ArrowRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Shown when the tenant has no stock movements at all: onboarding empty state
// that explains what movements are and points to where the first one is created.
export function StockHistoryEmpty({ inventoryHref }: { inventoryHref: string }) {
  const t = useTranslations('stockHistory');
  return (
    <div className="flex flex-col items-center justify-center text-center h-full min-h-[320px] px-6">
      <div className="w-16 h-16 rounded-2xl bg-app-elevated border border-app-border/60 flex items-center justify-center mb-5">
        <PackageOpen className="w-7 h-7 text-app-text-muted" />
      </div>
      <h3 className="text-base font-semibold text-app-text">{t('emptyTitle')}</h3>
      <p className="mt-2 text-sm text-app-text-secondary max-w-md leading-relaxed">
        {t('emptyDescription')}
      </p>
      <Button asChild size="sm" className="mt-5 gap-1.5">
        <Link href={inventoryHref}>
          <PackagePlus className="w-4 h-4" />
          {t('emptyCta')}
          <ArrowRight className="w-3.5 h-3.5 opacity-70" />
        </Link>
      </Button>
    </div>
  );
}

// Shown when movements exist but the active filter or search matches none.
export function StockHistoryNoResults({ onClear }: { onClear: () => void }) {
  const t = useTranslations('stockHistory');
  return (
    <div className="flex flex-col items-center justify-center text-center h-full min-h-[280px] px-6">
      <div className="w-12 h-12 rounded-xl bg-app-elevated flex items-center justify-center mb-4">
        <Search className="w-5 h-5 text-app-text-muted" />
      </div>
      <h3 className="text-sm font-semibold text-app-text">{t('noResultsTitle')}</h3>
      <p className="mt-1.5 text-sm text-app-text-muted">{t('noResultsHint')}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
        {t('clearFilters')}
      </Button>
    </div>
  );
}
