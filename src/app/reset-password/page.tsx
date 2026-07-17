'use client';

import { useState, useEffect, Suspense } from 'react';
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
import { createClient } from '@/lib/supabase/client';
import { Loader2, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { logger } from '@/lib/logger';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validations/auth.schema';

const inputClass =
  'h-10 rounded-lg border-[var(--border)] bg-[var(--card)] px-3 text-[16px] md:text-[14px] text-[var(--heading)] shadow-none placeholder:text-[var(--muted)] focus-visible:border-[var(--fg)] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0';
const labelClass = 'text-[13.5px] font-medium text-[var(--fg)]';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <ResetPasswordLoadingFallback />
        </AuthShell>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordLoadingFallback() {
  const t = useTranslations('auth.reset');
  return (
    <div className="w-full text-center">
      <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-[var(--muted)]" />
      <p className="text-sm text-[var(--secondary)]">{t('checkingText')}</p>
    </div>
  );
}

function ResetPasswordContent() {
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('auth.reset');
  const tForm = useTranslations('auth.form');
  // If the URL already contains ?error=invalid_token the token is known-invalid - skip checking.
  const [checking, setChecking] = useState(searchParams.get('error') !== 'invalid_token');

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  // Detect recovery session via two mechanisms:
  // 1. Primary: PASSWORD_RECOVERY event from onAuthStateChange (client-side token in URL hash)
  // 2. Fallback: getUser() check after a short delay (server-side token already consumed by /auth/callback)
  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
        setChecking(false);
      }
    });

    // If the URL has ?error=invalid_token, checking was already initialised to false - just cleanup.
    if (searchParams.get('error') === 'invalid_token') {
      return () => subscription.unsubscribe();
    }

    // Fallback: when /auth/callback consumed the token server-side, the PASSWORD_RECOVERY
    // event never fires. Check for an active session after a short delay.
    const fallbackTimer = setTimeout(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setSessionReady(true);
      }
      setChecking(false);
    }, 500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, [searchParams]);

  const onSubmit = async (data: ResetPasswordInput) => {
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: data.password });

      if (updateError) {
        const code = (updateError as { code?: string }).code;
        const msg = updateError.message?.toLowerCase() ?? '';
        logger.error('Password update failed', { error: updateError.message, code });
        if (code === 'same_password' || msg.includes('same') || msg.includes('different')) {
          form.setError('root', {
            message: t('samePasswordError'),
          });
        } else {
          form.setError('root', {
            message: t('genericError'),
          });
        }
      } else {
        setSuccess(true);
        // Redirect to login after 3 seconds
        setTimeout(() => router.push('/login'), 3000);
      }
    } catch {
      form.setError('root', { message: t('genericError') });
    }
  };

  return (
    <AuthShell>
      <div className="w-full">
        {success ? (
          <AuthCard>
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ok-bg)]">
                <CheckCircle2 className="h-7 w-7 text-[var(--ok-fg)]" />
              </div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--heading)]">
                {t('successTitle')}
              </h1>
              <p className="text-sm text-[var(--secondary)]">{t('successBody')}</p>
              <Button
                onClick={() => router.push('/login')}
                className="mt-1 h-10 w-full rounded-lg bg-[var(--fg)] text-sm font-medium text-[var(--primary-fg)] transition-colors hover:bg-[var(--fg-hover)]"
              >
                {t('backToLoginCta')}
              </Button>
            </div>
          </AuthCard>
        ) : checking ? (
          <AuthCard>
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--muted)]" />
              <p className="text-sm text-[var(--secondary)]">{t('checkingText')}</p>
            </div>
          </AuthCard>
        ) : !sessionReady ? (
          <AuthCard>
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--err-bg)]">
                <AlertTriangle className="h-7 w-7 text-[var(--err-fg)]" />
              </div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--heading)]">
                {t('expiredTitle')}
              </h1>
              <p className="text-sm text-[var(--secondary)]">{t('expiredBody')}</p>
              <Button
                onClick={() => router.push('/forgot-password')}
                className="mt-1 h-10 w-full rounded-lg bg-[var(--fg)] text-sm font-medium text-[var(--primary-fg)] transition-colors hover:bg-[var(--fg-hover)]"
              >
                {t('requestNewLink')}
              </Button>
            </div>
          </AuthCard>
        ) : (
          <>
            <div className="mb-7 text-center">
              <h1 className="mb-1.5 text-[22px] font-semibold tracking-[-0.02em] text-[var(--heading)]">
                {t('title')}
              </h1>
              <p className="text-sm text-[var(--secondary)]">{t('subtitle')}</p>
            </div>

            <AuthCard>
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
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>{t('newPasswordLabel')}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? 'text' : 'password'}
                              placeholder={t('newPasswordPlaceholder')}
                              autoFocus
                              className={`${inputClass} pr-10`}
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={
                                showPassword ? tForm('hidePassword') : tForm('showPassword')
                              }
                              aria-pressed={showPassword}
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-[var(--muted)] hover:bg-transparent hover:text-[var(--fg)]"
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>{t('confirmPasswordLabel')}</FormLabel>
                        <FormControl>
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder={t('confirmPasswordPlaceholder')}
                            className={inputClass}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Password strength hints - read directly from form values to avoid form.watch() */}
                  <div className="flex gap-2 text-xs">
                    <span
                      className={
                        (form.getValues('password') ?? '').length >= 8
                          ? 'text-[var(--ok-fg)]'
                          : 'text-[var(--muted)]'
                      }
                    >
                      {t('strengthLength')}
                    </span>
                    <span className="text-[var(--border)]">|</span>
                    <span
                      className={
                        form.getValues('password') === form.getValues('confirmPassword') &&
                        (form.getValues('confirmPassword') ?? '').length > 0
                          ? 'text-[var(--ok-fg)]'
                          : 'text-[var(--muted)]'
                      }
                    >
                      {t('strengthMatch')}
                    </span>
                  </div>

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
            </AuthCard>
          </>
        )}
      </div>
    </AuthShell>
  );
}
