'use client';

import { useTranslations } from 'next-intl';
import { ArrowLeft, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface POSTopBarProps {
  isMobile: boolean;
  mobileView: 'products' | 'cart';
  onMobileView: (view: 'products' | 'cart') => void;
  cartCount: number;
  /** Orders awaiting payment; undefined hides "A encaisser" (no orders.pay). */
  unpaidCount?: number;
  onOpenUnpaid: () => void;
  onBack: () => void;
}

/** Top bar of the till: back, products/cart tabs on a phone, "A encaisser". */
export function POSTopBar({
  isMobile,
  mobileView,
  onMobileView,
  cartCount,
  unpaidCount,
  onOpenUnpaid,
  onBack,
}: POSTopBarProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');

  return (
    <div className="flex items-center border-b border-app-border shrink-0">
      <Button
        variant="ghost"
        size="icon"
        aria-label={tc('aria.back')}
        onClick={onBack}
        className="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center text-app-text-secondary hover:text-app-text transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
      </Button>

      {isMobile ? (
        <div className="flex flex-1">
          <Button
            variant="ghost"
            onClick={() => onMobileView('products')}
            className={cn(
              'flex-1 py-3 min-h-[44px] text-sm font-semibold transition-colors rounded-none',
              mobileView === 'products'
                ? 'border-b-2 border-accent text-app-text'
                : 'text-app-text-muted',
            )}
          >
            {t('productsTab')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => onMobileView('cart')}
            className={cn(
              'flex-1 py-3 min-h-[44px] text-sm font-semibold transition-colors relative rounded-none',
              mobileView === 'cart'
                ? 'border-b-2 border-accent text-app-text'
                : 'text-app-text-muted',
            )}
          >
            {t('cart')}{' '}
            {cartCount > 0 && (
              <span className="ml-1 bg-accent text-accent-text text-xs rounded-full px-1.5 py-0.5">
                {cartCount}
              </span>
            )}
          </Button>
        </div>
      ) : (
        <h1 className="text-sm font-semibold text-app-text">{t('title')}</h1>
      )}

      {/* A encaisser: orders awaiting payment (incl. QR/served) */}
      {unpaidCount !== undefined && (
        <Button
          variant="ghost"
          // The label replaces the content: keep the count in it.
          aria-label={unpaidCount > 0 ? `${t('toSettle')} (${unpaidCount})` : t('toSettle')}
          onClick={onOpenUnpaid}
          className="relative ml-auto mr-2 min-h-[44px] gap-2 text-sm font-semibold text-app-text-secondary hover:text-app-text"
        >
          <Receipt className="h-4 w-4" />
          <span className="hidden @sm:inline">{t('toSettle')}</span>
          {unpaidCount > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs text-accent-text">
              {unpaidCount}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
