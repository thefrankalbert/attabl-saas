'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, Lock } from 'lucide-react';
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

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'azure' | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState(urlEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
        // Signup flow — restaurant name is collected during onboarding
        const response = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantName: 'Mon Restaurant',
            email,
            password,
            plan: 'essentiel',
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Erreur lors de l'inscription");
        }

        // Auto-login after successful signup
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          logger.error('Auto-login failed after signup', signInError);
          window.location.href = `/login?email=${encodeURIComponent(email)}&error=${encodeURIComponent(signInError.message)}`;
          return;
        }

        window.location.href = '/onboarding';
      } else {
        // Login flow
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) throw new Error(authError.message);

        // Login flow — query all admin_users (supports multi-restaurant)
        const { data: adminUsers } = await supabase
          .from('admin_users')
          .select('tenant_id, is_super_admin, role, tenants(slug, onboarding_completed)')
          .eq('user_id', authData.user.id);

        if (!adminUsers || adminUsers.length === 0) {
          throw new Error('Aucun restaurant associé à ce compte');
        }

        // Check if any tenant needs onboarding
        const needsOnboarding = adminUsers.some((au) => {
          const t = au.tenants as unknown as { onboarding_completed: boolean } | null;
          return t?.onboarding_completed === false;
        });

        if (needsOnboarding) {
          window.location.href = '/onboarding';
          return;
        }

        // All users land on the tenant hub — single or multi
        window.location.href = '/admin/tenants';
      }
    } catch (err) {
      logger.error('Auth form submit failed', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      if (errorMessage.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mx-auto w-full"
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
          {isLogin ? 'Votre établissement vous attend.' : 'Lancez votre menu digital'}
        </h1>
        <p className="text-app-text-secondary text-sm leading-relaxed">
          {isLogin
            ? 'Commandes, stock, chiffre d\u2019affaires. Tout est là.'
            : 'Créez votre compte en 30 secondes. 14 jours offerts, aucune carte requise.'}
        </p>
      </div>

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
            placeholder="nom@attabl.com"
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
                className="text-xs text-accent hover:text-accent-hover font-medium transition-colors"
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
              className="h-11 pr-12 bg-app-elevated border-app-border text-app-text placeholder:text-app-text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all rounded-xl text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text-muted hover:text-app-text-secondary transition-colors p-1"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Alert
              variant="destructive"
              className="bg-app-status-error-bg text-status-error border-status-error/20 rounded-xl"
            >
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        <Button
          type="submit"
          className="w-full h-11 bg-accent hover:bg-accent-hover text-accent-text text-sm font-bold rounded-xl shadow-sm transition-all active:scale-[0.98]"
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
            14 jours gratuits &mdash; aucun engagement
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
