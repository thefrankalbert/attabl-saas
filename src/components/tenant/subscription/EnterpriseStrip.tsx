'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
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
    <div className="flex flex-col gap-3 rounded-xl border border-app-border bg-app-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-elevated">
          <Sparkles className="h-4 w-4 text-app-text-secondary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-app-text">{t('subscription.enterpriseTitle')}</p>
          <p className="text-xs text-app-text-muted">{t('subscription.enterpriseDesc')}</p>
        </div>
      </div>
      <Button
        asChild
        variant="outline"
        className="h-9 shrink-0 gap-1.5 rounded-lg px-3 text-xs font-semibold"
      >
        <Link href={supportHref}>
          {t('subscription.enterpriseCta')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}
