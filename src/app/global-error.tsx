'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Global error boundary — catches errors in the root layout.
 * These are rare but critical (e.g., layout-level rendering failures).
 * Must include its own <html> and <body> tags since the root layout has failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error('Global error:', error);
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
            fontFamily: 'system-ui, sans-serif',
            backgroundColor: '#f9fafb',
            padding: '1rem',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <h2
              style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: '#111827',
                marginBottom: '0.5rem',
              }}
            >
              Une erreur critique est survenue
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Nous nous excusons pour ce d&eacute;sagr&eacute;ment. Veuillez r&eacute;essayer.
            </p>
            <button
              onClick={reset}
              style={{
                backgroundColor: '#d97706',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              R&eacute;essayer
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
