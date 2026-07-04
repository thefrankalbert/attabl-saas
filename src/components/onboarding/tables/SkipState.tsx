'use client';

import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';

export function SkipState() {
  const t = useTranslations('onboarding');

  return (
    <div className="rounded-xl border border-dashed border-app-border p-8 text-center">
      <Clock className="h-10 w-10 text-app-text-muted mx-auto mb-3" />
      <p className="text-base text-app-text-secondary font-medium">{t('skipInfo')}</p>
    </div>
  );
}
