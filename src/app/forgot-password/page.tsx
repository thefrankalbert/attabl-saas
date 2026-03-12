'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { createClient } from '@/lib/supabase/client';
import { Loader2, ArrowLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { logger } from '@/lib/logger';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });

      if (resetError) {
        logger.error('Password reset request failed', { error: resetError.message });
        setError('Une erreur est survenue. Veuillez réessayer.');
      } else {
        setSent(true);
      }
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
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
          Retour à la connexion
        </Link>

        {sent ? (
          /* Success state */
          <div className="text-center">
            <div className="w-14 h-14 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <MailCheck className="w-7 h-7 text-accent" />
            </div>
            <h1 className="text-2xl font-bold text-app-text mb-2">Vérifiez votre boîte mail</h1>
            <p className="text-sm text-app-text-secondary mb-6 leading-relaxed">
              Si un compte existe pour <strong className="text-app-text">{email}</strong>, vous
              recevrez un lien de réinitialisation dans quelques instants.
            </p>
            <p className="text-xs text-app-text-muted mb-6">
              Pensez à vérifier vos spams si vous ne voyez rien.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSent(false);
                setEmail('');
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
              <h1 className="text-2xl font-bold text-app-text mb-2">Mot de passe oublié ?</h1>
              <p className="text-sm text-app-text-secondary leading-relaxed">
                Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre
                mot de passe.
              </p>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-app-text-secondary font-medium text-xs uppercase tracking-widest"
                >
                  Adresse email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="min-h-[44px]"
                />
              </div>

              <Button type="submit" disabled={loading || !email} className="w-full min-h-[44px]">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Envoyer le lien de réinitialisation
              </Button>
            </form>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
