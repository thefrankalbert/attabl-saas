'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { AuthShell } from '@/components/auth/AuthShell';
import { Loader2, ArrowLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { logger } from '@/lib/logger';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth.schema';

const inputClass =
  'h-10 rounded-lg border-[var(--border)] bg-[var(--card)] px-3 text-[16px] md:text-[14px] text-[var(--heading)] shadow-none placeholder:text-[var(--muted)] focus-visible:border-[var(--fg)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0';
const labelClass = 'text-[13.5px] font-medium text-[var(--fg)]';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const t = useTranslations('auth.forgot');
  const tErr = useTranslations('auth.errors');

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    try {
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      });

      if (!response.ok) {
        const res = await response.json();
        logger.error('Password reset request failed', { error: res.error });
        form.setError('root', {
          message: res.error || tErr('generic'),
        });
      } else {
        setSent(true);
      }
    } catch {
      form.setError('root', { message: tErr('generic') });
    }
  };

  return (
    <AuthShell>
      <div className="w-full">
        <Link
          href="/login"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-[var(--secondary)] transition-colors hover:text-[var(--fg)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToLogin')}
        </Link>

        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ok-bg)]">
              <MailCheck className="h-7 w-7 text-[var(--ok-fg)]" />
            </div>
            <h1 className="mb-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--heading)]">
              {t('sentTitle')}
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-[var(--secondary)]">
              {t('sentBody', { email: form.getValues('email') })}
            </p>
            <p className="mb-6 text-xs text-[var(--muted)]">{t('spamHint')}</p>
            <Button
              variant="outline"
              onClick={() => {
                setSent(false);
                form.reset();
              }}
              className="w-full rounded-lg border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:bg-[var(--surface-hover)]"
            >
              {t('resend')}
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-7 text-center">
              <h1 className="mb-1.5 text-[22px] font-semibold tracking-[-0.02em] text-[var(--heading)]">
                {t('title')}
              </h1>
              <p className="text-sm text-[var(--secondary)]">{t('subtitle')}</p>
            </div>

            {form.formState.errors.root && (
              <Alert
                variant="destructive"
                className="mb-4 rounded-lg border-[var(--err-border)] bg-[var(--err-bg)] text-[var(--err-fg)] [&>svg]:text-[var(--err-fg)]"
              >
                <AlertDescription className="text-sm">
                  {form.formState.errors.root.message}
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={labelClass}>{t('emailLabel')}</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder={t('emailPlaceholder')}
                          autoFocus
                          className={inputClass}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="h-10 w-full rounded-lg bg-[var(--fg)] text-sm font-medium text-[var(--primary-fg)] transition-colors hover:bg-[var(--fg-hover)]"
                >
                  {form.formState.isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t('submit')}
                </Button>
              </form>
            </Form>
          </>
        )}
      </div>
    </AuthShell>
  );
}
