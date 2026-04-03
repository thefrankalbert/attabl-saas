'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { RefreshCw, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function AdminError({
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
    logger.error('Admin dashboard error', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-app-bg">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-app-card border border-app-border shadow-sm mb-6">
          <span className="text-4xl">&#x1F527;</span>
        </div>

        <h2 className="text-xl font-bold text-app-text mb-2">Erreur du tableau de bord</h2>
        <p className="text-app-text-muted mb-6 text-sm">
          Une erreur inattendue s&apos;est produite. Reessayez ou retournez au dashboard.
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

          <Link href={site ? `/sites/${site}/admin` : '/'}>
            <Button
              variant="outline"
              className="border-app-border text-app-text hover:bg-app-hover gap-2 w-full"
            >
              <LayoutDashboard className="w-4 h-4" />
              Retour au dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
