'use client';

import { useState, useEffect, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { AuthLayout } from '@/components/auth/AuthLayout';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { logger } from '@/lib/logger';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validations/auth.schema';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout>
          <div className="w-full text-center">
            <Loader2 className="w-8 h-8 animate-spin text-app-text-muted mx-auto mb-4" />
            <p className="text-sm text-app-text-secondary">Chargement...</p>
          </div>
        </AuthLayout>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // If the URL already contains ?error=invalid_token the token is known-invalid — skip checking.
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

    // If the URL has ?error=invalid_token, checking was already initialised to false — just cleanup.
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
            message: "Le nouveau mot de passe doit etre different de l'ancien.",
          });
        } else {
          form.setError('root', {
            message: 'Erreur lors de la mise a jour du mot de passe. Veuillez reessayer.',
          });
        }
      } else {
        setSuccess(true);
        // Redirect to login after 3 seconds
        setTimeout(() => router.push('/login'), 3000);
      }
    } catch {
      form.setError('root', { message: 'Une erreur est survenue. Veuillez reessayer.' });
    }
  };

  return (
    <AuthLayout>
      <div className="w-full">
        {success ? (
          /* Success state */
          <div className="text-center">
            <div className="w-14 h-14 bg-status-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-status-success" />
            </div>
            <h1 className="text-2xl font-bold text-app-text mb-2">Mot de passe mis a jour</h1>
            <p className="text-sm text-app-text-secondary mb-6">
              Votre mot de passe a ete change avec succes. Vous allez etre redirige vers la page de
              connexion.
            </p>
            <Button onClick={() => router.push('/login')} className="w-full min-h-[44px]">
              Se connecter
            </Button>
          </div>
        ) : checking ? (
          /* Loading - waiting for session detection */
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-app-text-muted mx-auto mb-4" />
            <p className="text-sm text-app-text-secondary">Verification en cours...</p>
          </div>
        ) : !sessionReady ? (
          /* No session - invalid or expired link */
          <div className="text-center">
            <div className="w-14 h-14 bg-status-warning-bg rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-status-warning" />
            </div>
            <h1 className="text-2xl font-bold text-app-text mb-2">Lien expire</h1>
            <p className="text-sm text-app-text-secondary mb-6">
              Ce lien de reinitialisation est invalide ou a expire. Veuillez en demander un nouveau.
            </p>
            <Button onClick={() => router.push('/forgot-password')} className="w-full min-h-[44px]">
              Demander un nouveau lien
            </Button>
          </div>
        ) : (
          /* Form state */
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-app-text mb-2">Nouveau mot de passe</h1>
              <p className="text-sm text-app-text-secondary leading-relaxed">
                Choisissez un nouveau mot de passe pour votre compte.
              </p>
            </div>

            {form.formState.errors.root && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-app-text-secondary font-medium text-xs uppercase tracking-widest">
                        Nouveau mot de passe
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Minimum 8 caracteres"
                            autoFocus
                            className="min-h-[44px] pr-10"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Hide password"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text-muted hover:text-app-text h-auto w-auto p-0"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
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
                      <FormLabel className="text-app-text-secondary font-medium text-xs uppercase tracking-widest">
                        Confirmer le mot de passe
                      </FormLabel>
                      <FormControl>
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Retapez votre mot de passe"
                          className="min-h-[44px]"
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
                        ? 'text-status-success'
                        : 'text-app-text-muted'
                    }
                  >
                    8+ caracteres
                  </span>
                  <span className="text-app-border">|</span>
                  <span
                    className={
                      form.getValues('password') === form.getValues('confirmPassword') &&
                      (form.getValues('confirmPassword') ?? '').length > 0
                        ? 'text-status-success'
                        : 'text-app-text-muted'
                    }
                  >
                    Mots de passe identiques
                  </span>
                </div>

                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="w-full min-h-[44px]"
                >
                  {form.formState.isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Mettre a jour le mot de passe
                </Button>
              </form>
            </Form>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
