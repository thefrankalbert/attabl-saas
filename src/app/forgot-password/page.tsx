'use client';

import { useState } from 'react';
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
import { Loader2, ArrowLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { logger } from '@/lib/logger';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth.schema';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

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
          message: res.error || 'Une erreur est survenue. Veuillez reessayer.',
        });
      } else {
        setSent(true);
      }
    } catch {
      form.setError('root', { message: 'Une erreur est survenue. Veuillez reessayer.' });
    }
  };

  return (
    <AuthLayout>
      <div className="w-full">
        {/* Back to login */}
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-app-text-secondary hover:text-app-text transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour a la connexion
        </Link>

        {sent ? (
          /* Success state */
          <div className="text-center">
            <div className="w-14 h-14 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <MailCheck className="w-7 h-7 text-accent" />
            </div>
            <h1 className="text-2xl font-bold text-app-text mb-2">Verifiez votre boite mail</h1>
            <p className="text-sm text-app-text-secondary mb-6 leading-relaxed">
              Si un compte existe pour{' '}
              <strong className="text-app-text">{form.getValues('email')}</strong>, vous recevrez un
              lien de reinitialisation dans quelques instants.
            </p>
            <p className="text-xs text-app-text-muted mb-6">
              Pensez a verifier vos spams si vous ne voyez rien.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSent(false);
                form.reset();
              }}
              className="w-full"
            >
              Renvoyer un lien
            </Button>
          </div>
        ) : (
          /* Form state */
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-app-text mb-2">Mot de passe oublie ?</h1>
              <p className="text-sm text-app-text-secondary leading-relaxed">
                Entrez votre adresse email et nous vous enverrons un lien pour reinitialiser votre
                mot de passe.
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
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-app-text-secondary font-medium text-xs uppercase tracking-widest">
                        Adresse email
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="vous@exemple.com"
                          autoFocus
                          className="min-h-[44px]"
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
                  className="w-full min-h-[44px]"
                >
                  {form.formState.isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Envoyer le lien de reinitialisation
                </Button>
              </form>
            </Form>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
