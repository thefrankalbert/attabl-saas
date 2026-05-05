'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { RefreshCw, ArrowLeft, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorLayout } from '@/components/shared/ErrorLayout';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const site = params?.site as string | undefined;
  const t = useTranslations('tenant');

  useEffect(() => {
    Sentry.captureException(error);
    logger.error('Tenant page error', error);
  }, [error]);

  return (
    <ErrorLayout
      variant="tenant"
      code="500"
      brand={
        <div className="flex items-center gap-3">
          <div className="rounded-[var(--radius-card)] p-2.5 bg-[var(--color-brand)]">
            <UtensilsCrossed className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-[var(--color-ink)]">ATTABL</span>
        </div>
      }
      title={t('errorTitle')}
      description={t('errorHint')}
      debug={
        process.env.NODE_ENV === 'development' ? (
          <div className="p-3 rounded-[var(--radius-card)] text-left border border-[var(--color-divider)] bg-red-50">
            <p className="text-xs font-mono break-all text-[var(--color-status-error)]">
              {error.message}
            </p>
          </div>
        ) : null
      }
      actions={
        <>
          <Button
            onClick={reset}
            className="gap-2 h-11 rounded-[var(--radius-card)] bg-[var(--color-ink)] text-white hover:bg-[var(--color-ink-2)] font-semibold px-6"
          >
            <RefreshCw className="w-4 h-4" />
            {t('retry')}
          </Button>
          <Button
            asChild
            variant="ghost"
            className="gap-2 h-11 rounded-[var(--radius-card)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <Link href={site ? `/sites/${site}/menu` : '/'}>
              <ArrowLeft className="w-4 h-4" />
              {t('backToMenu')}
            </Link>
          </Button>
        </>
      }
    />
  );
}
