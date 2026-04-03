'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const site = params?.site as string | undefined;

  useEffect(() => {
    Sentry.captureException(error);
    logger.error('Tenant page error', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-app-card border border-app-border shadow-sm mb-6">
          <span className="text-4xl">&#x1F615;</span>
        </div>

        <h2 className="text-xl font-bold text-app-text mb-2">Une erreur est survenue</h2>
        <p className="text-app-text-muted mb-6 text-sm">
          Quelque chose ne s&apos;est pas passe comme prevu. Reessayez ou retournez au menu.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <div className="mb-6 p-3 bg-status-error-bg rounded-xl text-left border border-app-border">
            <p className="text-xs font-mono text-status-error break-all">{error.message}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={reset}
            className="bg-accent text-accent-text hover:bg-accent-hover gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reessayer
          </Button>

          <Link href={site ? `/sites/${site}/menu` : '/'}>
            <Button
              variant="outline"
              className="border-app-border text-app-text hover:bg-app-hover gap-2 w-full"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour au menu
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
