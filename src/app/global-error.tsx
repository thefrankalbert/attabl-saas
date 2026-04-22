'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    logger.error('Global error', error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            backgroundColor: '#0a0a0a',
            padding: '1.5rem',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '420px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 12px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                marginBottom: '24px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '9999px',
                  backgroundColor: '#2e7d32',
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                Erreur critique
              </span>
            </div>

            <h2
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: '#ffffff',
                marginBottom: '12px',
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
              }}
            >
              Quelque chose s&apos;est mal passe
            </h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.6)',
                fontSize: '0.9375rem',
                lineHeight: 1.6,
                marginBottom: '32px',
              }}
            >
              Une erreur inattendue est survenue. Nos equipes ont ete alertees. Vous pouvez
              reessayer ou revenir plus tard.
            </p>
            {/* eslint-disable-next-line react/forbid-elements */}
            <button
              onClick={reset}
              style={{
                backgroundColor: '#2e7d32',
                color: '#ffffff',
                border: 'none',
                padding: '14px 28px',
                borderRadius: '10px',
                fontSize: '0.9375rem',
                cursor: 'pointer',
                fontWeight: 700,
                width: '100%',
              }}
            >
              Reessayer
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
