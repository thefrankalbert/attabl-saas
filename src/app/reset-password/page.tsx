'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const router = useRouter();

  // Supabase auto-detects the recovery token from the URL hash on mount
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });

    // Also check if we already have a session (user came via redirect)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        logger.error('Password update failed', { error: updateError.message });
        if (updateError.message.includes('same')) {
          setError('Le nouveau mot de passe doit être différent de l\u2019ancien.');
        } else {
          setError('Erreur lors de la mise à jour du mot de passe. Veuillez réessayer.');
        }
      } else {
        setSuccess(true);
        // Redirect to login after 3 seconds
        setTimeout(() => router.push('/login'), 3000);
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
        {success ? (
          /* Success state */
          <div className="text-center">
            <div className="w-14 h-14 bg-status-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-status-success" />
            </div>
            <h1 className="text-2xl font-bold text-app-text mb-2">Mot de passe mis à jour</h1>
            <p className="text-sm text-app-text-secondary mb-6">
              Votre mot de passe a été changé avec succès. Vous allez être redirigé vers la page de
              connexion.
            </p>
            <Button onClick={() => router.push('/login')} className="w-full min-h-[44px]">
              Se connecter
            </Button>
          </div>
        ) : !sessionReady ? (
          /* No session — invalid or expired link */
          <div className="text-center">
            <div className="w-14 h-14 bg-status-warning-bg rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-status-warning" />
            </div>
            <h1 className="text-2xl font-bold text-app-text mb-2">Lien expiré</h1>
            <p className="text-sm text-app-text-secondary mb-6">
              Ce lien de réinitialisation est invalide ou a expiré. Veuillez en demander un nouveau.
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

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-app-text-secondary font-medium text-xs uppercase tracking-widest"
                >
                  Nouveau mot de passe
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 8 caractères"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    className="min-h-[44px] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text-muted hover:text-app-text transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="confirmPassword"
                  className="text-app-text-secondary font-medium text-xs uppercase tracking-widest"
                >
                  Confirmer le mot de passe
                </Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Retapez votre mot de passe"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="min-h-[44px]"
                />
              </div>

              {/* Password strength hints */}
              <div className="flex gap-2 text-xs">
                <span
                  className={password.length >= 8 ? 'text-status-success' : 'text-app-text-muted'}
                >
                  8+ caractères
                </span>
                <span className="text-app-border">|</span>
                <span
                  className={
                    password === confirmPassword && confirmPassword.length > 0
                      ? 'text-status-success'
                      : 'text-app-text-muted'
                  }
                >
                  Mots de passe identiques
                </span>
              </div>

              <Button
                type="submit"
                disabled={loading || password.length < 8 || password !== confirmPassword}
                className="w-full min-h-[44px]"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Mettre à jour le mot de passe
              </Button>
            </form>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
