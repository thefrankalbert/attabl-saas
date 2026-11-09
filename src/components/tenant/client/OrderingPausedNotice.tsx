'use client';

import { CirclePause } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTenant } from '@/contexts/TenantContext';

/**
 * Bandeau de la vitrine en lecture seule (fin d'essai, 7 jours de grace): la
 * carte se consulte, la commande est en pause. Rien quand on peut commander.
 */
export function OrderingPausedNotice() {
  const { orderingPaused } = useTenant();
  const t = useTranslations('tenant');
  if (!orderingPaused) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 bg-[var(--color-ink)] px-4 py-2 text-center text-[12.5px] font-medium leading-snug text-white"
    >
      <CirclePause className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      <span className="min-w-0">{t('orderingPausedNotice')}</span>
    </div>
  );
}
