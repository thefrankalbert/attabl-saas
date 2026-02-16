'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
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

// Microsoft Icon SVG
const MicrosoftIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 23 23">
    <path fill="#f35325" d="M1 1h10v10H1z" />
    <path fill="#81bc06" d="M12 1h10v10H12z" />
    <path fill="#05a6f0" d="M1 12h10v10H1z" />
    <path fill="#ffba08" d="M12 12h10v10H12z" />
  </svg>
);

interface AuthFormProps {
  mode: 'login' | 'signup';
}

function AuthForm({ mode }: AuthFormProps) {
  const searchParams = useSearchParams();
  const urlEmail = searchParams.get('email') || '';
  const urlPlan = searchParams.get('plan') as 'essentiel' | 'premium' | null;

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'azure' | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState(urlEmail);
  const [password, setPassword] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<'essentiel' | 'premium'>(urlPlan || 'essentiel');

  const supabase = createClient();

  const handleOAuthLogin = async (provider: 'google' | 'azure') => {
    setOauthLoading(provider);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
          queryParams:
            mode === 'signup'
              ? {
                  plan: selectedPlan,
                  restaurant_name: restaurantName,
                }
              : undefined,
        },
      });

      if (error) throw error;
    } catch (err) {
      console.error(err);
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
        // Signup flow
        const response = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantName,
            email,
            password,
            plan: selectedPlan,
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

        const { data: adminUser } = await supabase
          .from('admin_users')
          .select('tenant_id, is_super_admin, role, tenants(slug, onboarding_completed)')
          .eq('user_id', authData.user.id)
          .single();

        if (!adminUser) {
          throw new Error('Aucun restaurant associé à ce compte');
        }

        const isSuperAdmin = adminUser.is_super_admin === true || adminUser.role === 'super_admin';

        const tenantsData = adminUser.tenants as unknown as {
          slug: string;
          onboarding_completed: boolean;
        } | null;

        const tenantSlug = tenantsData?.slug;
        const onboardingCompleted = tenantsData?.onboarding_completed;

        if (!tenantSlug && !isSuperAdmin) {
          throw new Error('Restaurant non trouvé');
        }

        if (isSuperAdmin) {
          window.location.href = '/admin/tenants';
          return;
        }

        if (onboardingCompleted === false) {
          window.location.href = '/onboarding';
          return;
        }

        const origin = window.location.origin;
        window.location.href = `${origin}/sites/${tenantSlug}/admin`;
      }
    } catch (err) {
      console.error(err);
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
      <Link href="/" className="flex items-center gap-2 mb-10 w-fit">
        <div className="bg-black rounded-lg p-1.5">
          <svg
            className="h-5 w-5 text-[#CCFF00]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
        </div>
        <span className="text-xl font-bold tracking-tight text-neutral-900">ATTABL</span>
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mb-2">
          {isLogin ? 'Accédez à votre tableau de bord' : 'Commencer gratuitement'}
        </h1>
        <p className="text-neutral-500 text-sm">
          {isLogin
            ? 'Connectez-vous pour piloter votre établissement.'
            : 'Inscription rapide — aucun engagement, aucune carte requise.'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Restaurant Name (Signup only) */}
        {!isLogin && (
          <div className="space-y-1.5">
            <Label htmlFor="restaurantName" className="text-neutral-700 font-medium text-sm">
              Nom de l&apos;établissement
            </Label>
            <Input
              id="restaurantName"
              type="text"
              placeholder="Ex: Le Petit Bistrot"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              required
              className="h-12 bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 transition-all rounded-lg"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-neutral-700 font-medium text-sm">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="nom@restaurant.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-12 bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 transition-all rounded-lg"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-neutral-700 font-medium text-sm">
              Mot de passe
            </Label>
            {isLogin && (
              <Link
                href="/forgot-password"
                className="text-sm text-neutral-400 hover:text-neutral-900 transition-colors"
              >
                Mot de passe oublié ?
              </Link>
            )}
          </div>
          <Input
            id="password"
            type="password"
            placeholder={isLogin ? '••••••••' : 'Minimum 8 caractères'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isLogin ? undefined : 8}
            className="h-12 bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 transition-all rounded-lg"
          />
        </div>

        {/* Plan Selection (Signup only) */}
        {!isLogin && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-neutral-700 font-medium text-sm">
                {urlPlan ? 'Votre plan sélectionné' : 'Choisissez votre plan'}
              </Label>
              {urlPlan && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPlan(selectedPlan === 'essentiel' ? 'premium' : 'essentiel')
                  }
                  className="text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors"
                >
                  Modifier
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedPlan('essentiel')}
                className={`p-4 rounded-lg border-2 text-left transition-all active:scale-[0.98] ${
                  selectedPlan === 'essentiel'
                    ? 'border-[#CCFF00] bg-[#CCFF00]/5 ring-1 ring-[#CCFF00]/20'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="font-bold text-neutral-900 leading-none mb-1">Essentiel</div>
                <div className="text-xs text-neutral-500">39 800 F / mois</div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPlan('premium')}
                className={`p-4 rounded-lg border-2 text-left transition-all active:scale-[0.98] ${
                  selectedPlan === 'premium'
                    ? 'border-[#CCFF00] bg-[#CCFF00]/5 ring-1 ring-[#CCFF00]/20'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="font-bold text-neutral-900 leading-none mb-1">Prime</div>
                <div className="text-xs text-neutral-500">79 800 F / mois</div>
              </button>
            </div>
          </div>
        )}

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Alert
              variant="destructive"
              className="bg-red-50 text-red-700 border-red-200 rounded-lg"
            >
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        <Button
          type="submit"
          className="w-full h-12 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold rounded-lg shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {isLogin ? 'Connexion...' : 'Création du compte...'}
            </>
          ) : isLogin ? (
            'Se connecter'
          ) : (
            'Créer mon compte'
          )}
        </Button>
      </form>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-neutral-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-widest">
          <span className="bg-white px-4 text-neutral-400">ou</span>
        </div>
      </div>

      {/* OAuth Buttons */}
      <div className="space-y-2.5">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuthLogin('google')}
          disabled={oauthLoading !== null}
          className="w-full h-12 rounded-lg border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 font-medium transition-all"
        >
          {oauthLoading === 'google' ? (
            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          <span className="ml-3">Continuer avec Google</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuthLogin('azure')}
          disabled={oauthLoading !== null}
          className="w-full h-12 rounded-lg border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 font-medium transition-all"
        >
          {oauthLoading === 'azure' ? (
            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
          ) : (
            <MicrosoftIcon />
          )}
          <span className="ml-3">Continuer avec Outlook</span>
        </Button>
      </div>

      {/* Footer Link */}
      <p className="mt-8 text-center text-sm text-neutral-500">
        {isLogin ? 'Pas encore de compte ?' : 'Déjà un compte ?'}{' '}
        <Link
          href={isLogin ? '/signup' : '/login'}
          className="font-semibold text-neutral-900 hover:underline"
        >
          {isLogin ? 'Commencer gratuitement' : 'Se connecter'}
        </Link>
      </p>
    </motion.div>
  );
}

export { AuthForm };
