'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');

  useEffect(() => {
    Sentry.captureException(error);
    logger.error('Application error', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-600" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('errorTitle')}</h2>
        <p className="text-gray-600 mb-6">{t('errorDescription')}</p>

        {process.env.NODE_ENV === 'development' && (
          <div className="mb-6 p-3 bg-red-50 rounded-lg text-left">
            <p className="text-xs font-mono text-red-700 break-all">{error.message}</p>
            {error.digest && <p className="text-xs text-red-500 mt-1">Digest: {error.digest}</p>}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} className="bg-amber-600 hover:bg-amber-700">
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('retry')}
          </Button>

          <Link href="/">
            <Button variant="outline">
              <Home className="w-4 h-4 mr-2" />
              {t('backToHome')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
