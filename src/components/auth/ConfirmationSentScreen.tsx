'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Loader2, MailCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { AuthCard } from './AuthCard';

interface ConfirmationSentScreenProps {
  email: string;
  emailUndelivered: boolean;
  resending: boolean;
  resendCooldown: number;
  onResend: () => void;
}

/**
 * Post-signup "check your inbox" screen. Rendered by AuthForm inside AuthShell
 * (which already provides the brand header + fade-up entrance), so this only
 * renders the confirmation card, styled with the shared .auth-shell zinc tokens.
 */
function ConfirmationSentScreen({
  email,
  emailUndelivered,
  resending,
  resendCooldown,
  onResend,
}: ConfirmationSentScreenProps) {
  const tConfirm = useTranslations('auth.confirm');

  return (
    <div>
      <div className="mb-7 text-center">
        <h1 className="mb-1.5 text-[22px] font-semibold tracking-[-0.02em] text-[var(--heading)]">
          {tConfirm('title')}
        </h1>
        <p className="text-sm text-[var(--secondary)]">{tConfirm('sentTo')}</p>
      </div>

      <AuthCard>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ok-border)] bg-[var(--ok-bg)]">
            <MailCheck className="h-[18px] w-[18px] text-[var(--ok-fg)]" />
          </div>
          <p className="break-all text-sm font-medium text-[var(--heading)]">{email}</p>
          <p className="text-[13.5px] leading-[1.5] text-[var(--secondary)]">
            {tConfirm('instructions')}
          </p>

          {emailUndelivered && (
            <div className="flex w-full items-center gap-2 rounded-lg border border-[var(--err-border)] bg-[var(--err-bg)] px-3 py-2 text-[13px] text-[var(--err-fg)]">
              <AlertTriangle className="h-[14px] w-[14px] shrink-0" />
              <span className="text-left">{tConfirm('deliveryWarning')}</span>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={onResend}
            disabled={resending || resendCooldown > 0}
            className="mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-lg border-[var(--border)] bg-[var(--card)] text-sm font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
          >
            {resending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {tConfirm('resendSending')}
              </>
            ) : resendCooldown > 0 ? (
              tConfirm('resendCooldown', { seconds: resendCooldown })
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                {tConfirm('resendButton')}
              </>
            )}
          </Button>

          <p className="text-xs text-[var(--muted)]">
            {tConfirm('spamHint')}{' '}
            <Button
              type="button"
              variant="ghost"
              onClick={onResend}
              disabled={resendCooldown > 0}
              className="inline h-auto p-0 font-medium text-[var(--fg)] underline transition-colors hover:text-[var(--subtle)] disabled:opacity-50"
            >
              {resendCooldown > 0
                ? tConfirm('resendHereCooldown', { seconds: resendCooldown })
                : tConfirm('resendHere')}
            </Button>
            .
          </p>
        </div>
      </AuthCard>

      <p className="mt-6 text-center text-sm text-[var(--secondary)]">
        <Link href="/login" className="font-medium text-[var(--fg)] hover:underline">
          {tConfirm('backToLogin')}
        </Link>
      </p>
    </div>
  );
}

export { ConfirmationSentScreen };
