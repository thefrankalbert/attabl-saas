'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { RefreshCw, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorLayout } from '@/components/shared/ErrorLayout';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const site = params?.site as string | undefined;
  const t = useTranslations('common');

  useEffect(() => {
    Sentry.captureException(error);
    logger.error('Admin dashboard error', error);
  }, [error]);

  return (
    <ErrorLayout
      variant="admin"
      code="500"
      brand={
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-accent p-2.5">
            <LayoutDashboard className="h-6 w-6 text-accent-text" />
          </div>
          <span className="text-2xl font-bold text-app-text">ATTABL</span>
        </div>
      }
      title={t('errorTitle')}
      description={t('errorHint')}
      debug={
        process.env.NODE_ENV === 'development' ? (
          <div className="p-3 bg-status-error-bg rounded-xl text-left border border-app-border">
            <p className="text-xs font-mono text-status-error break-all">{error.message}</p>
          </div>
        ) : null
      }
      actions={
        <>
          <Button
            onClick={reset}
            className="gap-2 h-11 rounded-xl bg-accent text-accent-text hover:bg-accent-hover"
          >
            <RefreshCw className="w-4 h-4" />
            {t('retry')}
          </Button>
          <Button asChild variant="outline" className="gap-2 h-11 rounded-xl">
            <Link href={site ? `/sites/${site}/admin` : '/'}>
              <LayoutDashboard className="w-4 h-4" />
              {t('backToDashboard')}
            </Link>
          </Button>
        </>
      }
    />
  );
}
