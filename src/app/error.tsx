'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { RefreshCw, Home } from 'lucide-react';
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
  const [wiggle, setWiggle] = useState(false);

  useEffect(() => {
    Sentry.captureException(error);
    logger.error('Application error', error);
  }, [error]);

  // Periodic wiggle animation on the emoji
  useEffect(() => {
    const interval = setInterval(() => {
      setWiggle(true);
      setTimeout(() => setWiggle(false), 600);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {/* Fun animated illustration */}
        <div className="relative mx-auto mb-10">
          {/* Floating particles */}
          <div
            className="absolute -top-4 left-1/4 w-2 h-2 rounded-full bg-accent/40 animate-bounce"
            style={{ animationDelay: '0s', animationDuration: '2s' }}
          />
          <div
            className="absolute -top-2 right-1/4 w-1.5 h-1.5 rounded-full bg-status-warning/40 animate-bounce"
            style={{ animationDelay: '0.5s', animationDuration: '2.5s' }}
          />
          <div
            className="absolute top-8 -left-2 w-1 h-1 rounded-full bg-status-info/40 animate-bounce"
            style={{ animationDelay: '1s', animationDuration: '3s' }}
          />

          {/* Main emoji circle */}
          <div className="relative inline-flex items-center justify-center w-28 h-28 rounded-3xl bg-app-card border-2 border-app-border shadow-sm">
            <span
              className={`text-5xl select-none transition-transform duration-300 ${wiggle ? 'scale-110 rotate-12' : ''}`}
              role="img"
              aria-label="oops"
            >
              {'\uD83D\uDE35\u200D\uD83D\uDCAB'}
            </span>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-app-text mb-3">{t('errorTitle')}</h2>
        <p className="text-app-text-secondary mb-2 text-sm leading-relaxed max-w-xs mx-auto">
          {t('errorDescription')}
        </p>
        <p className="text-app-text-muted mb-8 text-xs">
          {t('errorHint') || 'Pas de panique, ce sont des choses qui arrivent.'}
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
