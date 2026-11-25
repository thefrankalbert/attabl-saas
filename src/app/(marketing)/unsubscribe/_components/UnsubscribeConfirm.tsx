'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Status = 'idle' | 'pending' | 'done' | 'error';

/** Bouton de confirmation: envoie la meme demande que le bouton de la messagerie (RFC 8058). */
export function UnsubscribeConfirm({ token }: { token: string }) {
  const t = useTranslations('unsubscribe');
  const [status, setStatus] = useState<Status>('idle');

  async function confirm() {
    setStatus('pending');
    try {
      const response = await fetch(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      });
      setStatus(response.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <p
        role="status"
        className="mt-4 flex items-start gap-2 text-base leading-[1.6] text-zinc-700 dark:text-zinc-300"
      >
        <Check className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
        {t('success')}
      </p>
    );
  }

  return (
    <>
      <p className="mt-4 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">{t('intro')}</p>
      <Button
        type="button"
        onClick={confirm}
        disabled={status === 'pending'}
        className="mt-6 h-auto rounded-[10px] bg-zinc-900 px-6 py-3 text-[15px] font-semibold text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {status === 'pending' ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t('pending')}
          </span>
        ) : (
          t('confirm')
        )}
      </Button>
      {status === 'error' && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {t('error')}
        </p>
      )}
    </>
  );
}
