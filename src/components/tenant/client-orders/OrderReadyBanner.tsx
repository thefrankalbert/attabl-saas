'use client';

import { BellRing, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

interface OrderReadyBannerProps {
  readyOrderNumber: string | null;
  dismissBanner: () => void;
}

export function OrderReadyBanner({ readyOrderNumber, dismissBanner }: OrderReadyBannerProps) {
  const t = useTranslations('tenant');

  return (
    <div className="text-white rounded-xl px-4 py-4 flex items-center gap-3 bg-app-text">
      <BellRing className="w-6 h-6 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">{t('orderReadyNotifTitle')}</p>
        <p className="text-xs opacity-90">
          {t('orderReadyNotifBody', { number: readyOrderNumber || '' })}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={dismissBanner}
        className="rounded-full hover:bg-white/20 shrink-0 min-h-[44px] min-w-[44px] text-white"
        aria-label={t('close')}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
