'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface EnterpriseStripProps {
  supportHref: string;
}

/**
 * Slim "contact sales" row under the self-service plans, for tenants whose
 * needs outgrow Business (multi-site, high volume, custom).
 */
export function EnterpriseStrip({ supportHref }: EnterpriseStripProps) {
  const t = useTranslations('admin');

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-app-border bg-app-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-app-text">{t('subscription.enterpriseTitle')}</p>
        <p className="mt-0.5 text-sm text-app-text-secondary">{t('subscription.enterpriseDesc')}</p>
      </div>
      <Button
        asChild
        variant="outline"
        className="h-10 shrink-0 rounded-lg px-4 text-sm font-semibold"
      >
        <Link href={supportHref}>{t('subscription.enterpriseCta')}</Link>
      </Button>
    </div>
  );
}
