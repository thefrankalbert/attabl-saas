'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { RefreshCw, Home, Zap } from 'lucide-react';
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
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        {/* Fun animated illustration */}
        <div className="relative mx-auto mb-8 w-32 h-32">
          {/* Outer glow ring */}
          <div
            className="absolute inset-0 rounded-full bg-accent/10 animate-ping"
            style={{ animationDuration: '3s' }}
          />
          {/* Inner circle */}
          <div className="relative w-32 h-32 rounded-full bg-app-card border-2 border-app-border flex items-center justify-center">
            <div className="relative">
              <Zap className="w-12 h-12 text-accent" />
              <span className="absolute -top-1 -right-1 text-2xl" role="img" aria-label="oops">
                {'!'}
              </span>
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-app-text mb-2">{t('errorTitle')}</h2>
        <p className="text-app-text-secondary mb-8 text-sm leading-relaxed">
          {t('errorDescription')}
        </p>

        {process.env.NODE_ENV === 'development' && (
          <div className="mb-6 p-3 bg-status-error-bg rounded-xl text-left border border-app-border">
            <p className="text-xs font-mono text-status-error break-all">{error.message}</p>
            {error.digest && (
              <p className="text-xs text-app-text-muted mt-1">Digest: {error.digest}</p>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={reset}
            className="bg-accent text-accent-text hover:bg-accent-hover gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t('retry')}
          </Button>

          <Link href="/">
            <Button
              variant="outline"
              className="border-app-border text-app-text hover:bg-app-hover gap-2 w-full"
            >
              <Home className="w-4 h-4" />
              {t('backToHome')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
