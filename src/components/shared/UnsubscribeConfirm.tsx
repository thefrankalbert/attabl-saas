'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Step = 'ask' | 'unsubscribed' | 'resubscribed';
type Action = 'unsubscribe' | 'resubscribe';

/**
 * Un clic pour se desabonner, un clic pour revenir. Le jeton a deja ete
 * verifie par la page; la route le reverifie avant toute ecriture.
 */
export function UnsubscribeConfirm({ token }: { token: string }) {
  const t = useTranslations('unsubscribe');
  const [step, setStep] = useState<Step>('ask');
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(action: Action) {
    setPending(action);
    setError(null);
    try {
      const response = await fetch('/api/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      });
      if (response.ok) {
        setStep(action === 'unsubscribe' ? 'unsubscribed' : 'resubscribed');
      } else {
        setError(response.status === 429 ? t('rateLimited') : t('error'));
      }
    } catch {
      setError(t('error'));
    } finally {
      setPending(null);
    }
  }

  const title =
    step === 'ask' ? t('title') : step === 'unsubscribed' ? t('doneTitle') : t('resubscribedTitle');
  const body =
    step === 'ask'
      ? t('subtitle')
      : step === 'unsubscribed'
        ? t('doneBody')
        : t('resubscribedBody');
  const next: Action = step === 'unsubscribed' ? 'resubscribe' : 'unsubscribe';
  const label =
    step === 'ask'
      ? t('confirm')
      : step === 'unsubscribed'
        ? t('resubscribe')
        : t('unsubscribeAgain');

  return (
    <div>
      {step !== 'ask' && (
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ok-border)] bg-[var(--ok-bg)]">
          <MailCheck className="h-[18px] w-[18px] text-[var(--ok-fg)]" />
        </div>
      )}
      <h1 className="auth-serif auth-title mb-3">{title}</h1>
      <p className="mb-8 text-[15px] leading-relaxed text-[var(--secondary)]" aria-live="polite">
        {body}
      </p>

      {error && (
        <Alert
          variant="destructive"
          className="mb-4 rounded-lg border-[var(--err-border)] bg-[var(--err-bg)] text-[var(--err-fg)] [&>svg]:text-[var(--err-fg)]"
        >
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        onClick={() => send(next)}
        disabled={pending !== null}
        className={step === 'unsubscribed' ? 'auth-btn-secondary' : 'auth-btn-primary'}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {label}
      </Button>

      <p className="mt-6 text-center text-sm">
        <Link href="/" className="auth-link">
          {t('backHome')}
        </Link>
      </p>
    </div>
  );
}
