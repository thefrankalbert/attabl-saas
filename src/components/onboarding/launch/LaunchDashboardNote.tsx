'use client';

import { useTranslations } from 'next-intl';
import { LayoutDashboard } from 'lucide-react';

export function LaunchDashboardNote() {
  const t = useTranslations('onboarding');

  return (
    <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-accent/5 border border-accent/20">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
        <LayoutDashboard className="h-4 w-4 text-accent" />
      </div>
      <div>
        <p className="text-sm font-semibold text-app-text mb-0.5">{t('dashboardNextTitle')}</p>
        <p className="text-xs text-app-text-secondary leading-relaxed">{t('dashboardNextDesc')}</p>
      </div>
    </div>
  );
}
