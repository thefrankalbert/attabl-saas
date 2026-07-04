'use client';

import { useTranslations } from 'next-intl';
import { LayoutDashboard } from 'lucide-react';

export function LaunchDashboardNote() {
  const t = useTranslations('onboarding');

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
        <LayoutDashboard className="h-4 w-4 text-accent" />
      </div>
      <div>
        <p className="mb-0.5 text-sm font-semibold text-app-text">{t('dashboardNextTitle')}</p>
        <p className="text-xs leading-relaxed text-app-text-secondary">{t('dashboardNextDesc')}</p>
      </div>
    </div>
  );
}
