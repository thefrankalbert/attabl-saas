'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, Lock, MailCheck, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { logger } from '@/lib/logger';

// Google Icon SVG
const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

interface AuthFormProps {
  mode: 'login' | 'signup';
}

function AuthForm({ mode }: AuthFormProps) {
  const searchParams = useSearchParams();
  const urlEmail = searchParams.get('email') || '';
  const isConfirmed = searchParams.get('confirmed') === 'true';
  const urlError = searchParams.get('error') || '';

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'azure' | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState(urlEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const supabase = createClient();

  const handleOAuthLogin = async (provider: 'google' | 'azure') => {
    setOauthLoading(provider);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (err) {
      logger.error('OAuth login failed', err);
      setError('Erreur de connexion. Veuillez réessayer.');
      setOauthLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'signup') {
        // Signup flow - restaurant name is collected during onboarding
        const response = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantName: 'Mon Établissement',
            email,
            password,
            plan: 'starter',
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Erreur lors de l'inscription");
        }

        // Account created - show confirmation message
        setConfirmationSent(true);
      } else {
        // Login flow - server-side with rate limiting
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (data.error === 'email_not_confirmed') {
            throw new Error('Email not confirmed');
          }
          throw new Error(data.error || 'Erreur de connexion');
        }

        // Redirect based on server response
        window.location.href = data.redirect || '/admin/tenants';
      }
    } catch (err) {
      logger.error('Auth form submit failed', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      // The 'Email not confirmed' path re-throws with that literal string
      // (line 125). All other errors come pre-translated from /api/login or
      // /api/signup (rate limiting, validation, invalid credentials). No
      // longer match the Supabase English message — that was dead code
      // since the client never sees raw Supabase errors.
      if (errorMessage === 'Email not confirmed') {
        setError('email_not_confirmed');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';

  const handleResendConfirmation = useCallback(async () => {
    if (resending || !email || resendCooldown > 0) return;
    setResending(true);
    try {
      const response = await fetch('/api/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erreur lors de l'envoi");
      }
      // Start 60s cooldown
      setResendCooldown(60);
      cooldownRef.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            cooldownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      logger.error('Failed to resend confirmation', err);
    } finally {
      setResending(false);
    }
  }, [email, resending, resendCooldown]);

  // Show confirmation sent screen after signup
  if (confirmationSent) {
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
            Vérifiez votre boîte mail
          </h1>
          <p className="text-app-text-secondary text-sm leading-relaxed mb-2">
            Un email de confirmation a été envoyé à
          </p>
          <p className="text-app-text font-semibold text-sm mb-6">{email}</p>
          <p className="text-app-text-secondary text-sm leading-relaxed mb-8">
            Cliquez sur le lien dans l&apos;email pour activer votre compte et accéder à la
            configuration de votre établissement.
          </p>

          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleResendConfirmation}
              disabled={resending || resendCooldown > 0}
              className="w-full h-11 rounded-xl border-app-border bg-app-elevated hover:bg-app-hover text-app-text font-medium transition-all"
            >
              {resending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Envoi en cours...
                </>
              ) : resendCooldown > 0 ? (
                <>Renvoyer dans {resendCooldown}s</>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Renvoyer l&apos;email de confirmation
                </>
              )}
            </Button>

            <p className="text-xs text-app-text-muted">
              Vous ne trouvez pas l&apos;email ? Vérifiez vos spams ou{' '}
              <Button
                type="button"
                variant="ghost"
                onClick={handleResendConfirmation}
                disabled={resendCooldown > 0}
                className="text-accent hover:text-accent-hover font-medium transition-colors disabled:opacity-50 h-auto p-0 inline"
              >
                {resendCooldown > 0 ? `renvoyez-le (${resendCooldown}s)` : 'renvoyez-le'}
              </Button>
              .
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-app-border">
            <Link
              href="/login"
              className="text-sm font-bold text-accent hover:text-accent-hover transition-colors"
            >
              Retour à la connexion
            </Link>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mx-auto w-full overflow-y-auto"
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-10 w-fit group">
        <span className="text-xl font-bold tracking-tight text-app-text group-hover:text-accent transition-colors">
          ATTABL
        </span>
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-app-text mb-2">
          {isLogin
            ? 'Votre établissement vous attend.'
            : 'Créez votre compte en 2 minutes. 14 jours gratuits.'}
        </h1>
        <p className="text-app-text-secondary text-sm leading-relaxed">
          {isLogin
            ? "Commandes, stock, chiffre d'affaires. Tout est là."
            : 'Aucune carte bancaire requise. Annulez quand vous voulez.'}
        </p>
      </div>

      {/* Email confirmed success banner */}
      {isLogin && isConfirmed && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <Alert className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 rounded-xl">
            <MailCheck className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Votre email a été confirmé avec succès. Vous pouvez maintenant vous connecter.
            </AlertDescription>
          </Alert>
        </motion.div>
      )}

      {/* URL error banner (e.g. expired confirmation link) */}
      {isLogin &&
        urlError &&
        !error &&
        (() => {
          const ERROR_MESSAGES: Record<string, string> = {
            oauth_failed: 'La connexion OAuth a echoue. Veuillez reessayer.',
            auth_failed: "Erreur d'authentification. Veuillez reessayer.",
            session_expired: 'Votre session a expire. Veuillez vous reconnecter.',
            email_not_confirmed: 'Veuillez confirmer votre email avant de vous connecter.',
            access_denied: 'Acces refuse.',
            invalid_token: 'Le lien a expire ou est invalide. Veuillez reessayer.',
            expired_link: 'Ce lien a expire. Veuillez en demander un nouveau.',
          };
          const safeMessage =
            ERROR_MESSAGES[urlError] || 'Une erreur est survenue. Veuillez reessayer.';
          return (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4"
            >
              <Alert
                variant="destructive"
                className="bg-app-status-error-bg text-status-error border-status-error/20 rounded-xl"
              >
                <AlertDescription className="text-sm">{safeMessage}</AlertDescription>
              </Alert>
            </motion.div>
          );
        })()}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label
            htmlFor="email"
            className="text-app-text-secondary font-medium text-xs uppercase tracking-widest"
          >
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 bg-app-elevated border-app-border text-app-text placeholder:text-app-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all rounded-xl text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="password"
              className="text-app-text-secondary font-medium text-xs uppercase tracking-widest"
            >
              Mot de passe
            </Label>
            {isLogin && (
              <Link
                href="/forgot-password"
                className="text-xs text-accent hover:text-accent-hover font-medium transition-colors whitespace-nowrap"
              >
                Oublié ?
              </Link>
            )}
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={isLogin ? '••••••••' : 'Minimum 8 caractères'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isLogin ? undefined : 8}
              className="h-12 pr-12 bg-app-elevated border-app-border text-app-text placeholder:text-app-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all rounded-xl text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text-muted hover:text-app-text-secondary transition-colors h-8 w-8"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Alert
              variant="destructive"
              className="bg-app-status-error-bg text-status-error border-status-error/20 rounded-xl"
            >
              <AlertDescription className="text-sm">
                {error === 'email_not_confirmed' ? (
                  <span>
                    Votre adresse email n&apos;a pas encore été confirmée.{' '}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleResendConfirmation}
                      disabled={resending}
                      className="font-bold underline hover:no-underline h-auto p-0 inline"
                    >
                      {resending ? 'Envoi...' : 'Renvoyer le lien'}
                    </Button>
                  </span>
                ) : (
                  error
                )}
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        <Button
          type="submit"
          className="w-full h-11 bg-accent hover:bg-accent-hover text-accent-text text-sm font-bold rounded-xl transition-all active:scale-[0.98]"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isLogin ? 'Connexion...' : 'Création en cours...'}
            </>
          ) : isLogin ? (
            'Se connecter'
          ) : (
            'Commencer gratuitement'
          )}
        </Button>

        {/* Trust signal for signup */}
        {!isLogin && (
          <p className="text-center text-xs text-app-text-muted">
            14 jours gratuits - aucun engagement
          </p>
        )}
      </form>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-app-border" />
        </div>
        <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] font-medium">
          <span className="bg-app-bg px-4 text-app-text-muted">ou</span>
        </div>
      </div>

      {/* OAuth Buttons */}
      <div className="space-y-2.5">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuthLogin('google')}
          disabled={oauthLoading !== null}
          className="w-full h-11 rounded-xl border-app-border bg-app-elevated hover:bg-app-hover text-app-text font-medium transition-all active:scale-[0.98]"
        >
          {oauthLoading === 'google' ? (
            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          <span className="ml-3 text-sm">Continuer avec Google</span>
        </Button>
      </div>

      {/* Trust badge */}
      <div className="flex items-center justify-center gap-1.5 mt-6 text-app-text-muted">
        <Lock className="w-3 h-3" />
        <span className="text-[10px]">Connexion sécurisée &middot; Données chiffrées</span>
      </div>

      {/* Footer Link */}
      <p className="mt-4 text-center text-sm text-app-text-muted">
        {isLogin ? 'Pas encore de compte ?' : 'Déjà un compte ?'}{' '}
        <Link
          href={isLogin ? '/signup' : '/login'}
          className="font-bold text-accent hover:text-accent-hover transition-colors"
        >
          {isLogin ? 'Commencer gratuitement' : 'Se connecter'}
        </Link>
      </p>
    </motion.div>
  );
}

export { AuthForm };
