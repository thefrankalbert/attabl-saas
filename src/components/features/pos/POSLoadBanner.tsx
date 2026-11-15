'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface POSLoadBannerProps {
  menuUnavailable: boolean;
  extrasError: boolean;
  onRetry: () => void;
}

/** Load problem of the till, visible and retryable (it used to be silent). */
export function POSLoadBanner({ menuUnavailable, extrasError, onRetry }: POSLoadBannerProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');
  if (!menuUnavailable && !extrasError) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 border-b border-app-border bg-status-warning-bg px-3 py-2 text-sm text-app-text shrink-0"
    >
      <span>
        {[menuUnavailable && t('menuLoadError'), extrasError && t('settingsLoadError')]
          .filter(Boolean)
          .join(' ')}
      </span>
      <Button variant="outline" size="sm" className="min-h-[44px] shrink-0" onClick={onRetry}>
        {tc('retry')}
      </Button>
    </div>
  );
}
