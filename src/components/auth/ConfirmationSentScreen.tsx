'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MailCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface ConfirmationSentScreenProps {
  email: string;
  emailUndelivered: boolean;
  resending: boolean;
  resendCooldown: number;
  onResend: () => void;
}

function ConfirmationSentScreen({
  email,
  emailUndelivered,
  resending,
  resendCooldown,
  onResend,
}: ConfirmationSentScreenProps) {
  const tConfirm = useTranslations('auth.confirm');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mx-auto w-full"
    >
      <Link href="/" className="flex items-center gap-2 mb-10 w-fit group">
        <span className="text-xl font-bold tracking-tight text-app-text group-hover:text-accent transition-colors">
          ATTABL
        </span>
      </Link>

      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
          <MailCheck className="h-8 w-8 text-accent" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-app-text mb-3">
          {tConfirm('title')}
        </h1>
        <p className="text-app-text-secondary text-sm leading-relaxed mb-2">{tConfirm('sentTo')}</p>
        <p className="text-app-text font-semibold text-sm mb-6">{email}</p>
        <p className="text-app-text-secondary text-sm leading-relaxed mb-8">
          {tConfirm('instructions')}
        </p>

        {emailUndelivered && (
          <Alert variant="destructive" className="mb-6 text-left">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{tConfirm('deliveryWarning')}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={onResend}
            disabled={resending || resendCooldown > 0}
            className="w-full h-11 rounded-xl border-app-border bg-app-elevated hover:bg-app-hover text-app-text font-medium transition-all"
          >
            {resending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tConfirm('resendSending')}
              </>
            ) : resendCooldown > 0 ? (
              <>{tConfirm('resendCooldown', { seconds: resendCooldown })}</>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                {tConfirm('resendButton')}
              </>
            )}
          </Button>

          <p className="text-xs text-app-text-muted">
            {tConfirm('spamHint')}{' '}
            <Button
              type="button"
              variant="ghost"
              onClick={onResend}
              disabled={resendCooldown > 0}
              className="text-accent hover:text-accent-hover font-medium transition-colors disabled:opacity-50 h-auto p-0 inline"
            >
              {resendCooldown > 0
                ? tConfirm('resendHereCooldown', { seconds: resendCooldown })
                : tConfirm('resendHere')}
            </Button>
            .
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-app-border">
          <Link
            href="/login"
            className="text-sm font-bold text-accent hover:text-accent-hover transition-colors"
          >
            {tConfirm('backToLogin')}
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

export { ConfirmationSentScreen };
