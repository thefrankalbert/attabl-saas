'use client';

import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';

export function SkipState() {
  const t = useTranslations('onboarding');

  return (
    <div className="rounded-xl border border-app-border bg-app-elevated p-8 text-center shadow-sm">
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-app-card">
        <Clock className="h-5 w-5 text-app-text-muted" />
      </span>
      <p className="text-sm font-medium text-app-text-secondary">{t('skipInfo')}</p>
    </div>
  );
}
