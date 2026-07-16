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
import { AuthCard } from '@/components/auth/AuthCard';
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
        <div className="mb-7 text-center">
          <h1 className="mb-1.5 text-[22px] font-semibold tracking-[-0.02em] text-[var(--heading)]">
            {t('title')}
          </h1>
          <p className="text-sm leading-relaxed text-[var(--secondary)]">{t('subtitle')}</p>
        </div>

        <AuthCard>
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ok-border)] bg-[var(--ok-bg)]">
                <MailCheck className="h-[18px] w-[18px] text-[var(--ok-fg)]" />
              </div>
              <p className="text-sm font-medium text-[var(--heading)]">{t('sentTitle')}</p>
              <p className="text-[13.5px] leading-relaxed text-[var(--secondary)]">
                {t('sentBody', { email: form.getValues('email') })}
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  setSent(false);
                  form.reset();
                }}
                className="mt-1 h-auto p-1 text-[13px] font-medium text-[var(--fg)] underline hover:bg-transparent hover:text-[var(--subtle)]"
              >
                {t('resend')}
              </Button>
            </div>
          ) : (
            <>
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
        </AuthCard>

        <p className="mt-6 text-center text-sm text-[var(--secondary)]">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 font-medium text-[var(--fg)] hover:underline"
          >
            <ArrowLeft className="h-[13px] w-[13px]" />
            {t('backToLogin')}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
