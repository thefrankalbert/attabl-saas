'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowRight, Layout } from 'lucide-react';
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

        // Auto-login after successful signup (to establish session before /onboarding)
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          logger.error('Auto-login failed after signup', signInError);
          // If auto-login fails, redirect to login with a message
          window.location.href = `/login?email=${encodeURIComponent(email)}&error=${encodeURIComponent(signInError.message)}`;
          return;
        }

        // Redirect to onboarding wizard
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
          .select('tenant_id, is_super_admin, role, tenants(slug)')
          .eq('user_id', authData.user.id)
          .single();

        if (!adminUser) {
          throw new Error('Aucun restaurant associé à ce compte');
        }

        // Check if user is Super Admin
        const isSuperAdmin = adminUser.is_super_admin === true || adminUser.role === 'super_admin';

        const tenantsData = adminUser.tenants as unknown;
        let tenantSlug: string | undefined;

        if (Array.isArray(tenantsData) && tenantsData.length > 0) {
          tenantSlug = (tenantsData[0] as { slug: string }).slug;
        } else if (tenantsData && typeof tenantsData === 'object') {
          tenantSlug = (tenantsData as { slug: string }).slug;
        }

        if (!tenantSlug && !isSuperAdmin) {
          throw new Error('Restaurant non trouvé');
        }

        const isDev = window.location.hostname === 'localhost';

        // Super Admin: redirect to tenant selector
        if (isSuperAdmin) {
          window.location.href = '/admin/tenants';
        } else if (isDev) {
          window.location.href = `http://${tenantSlug}.localhost:3000/admin`;
        } else {
          window.location.href = `https://${tenantSlug}.attabl.com/admin`;
        }
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
      className="mx-auto w-full max-w-md relative"
    >
      {/* Back Home Link */}
      <div className="absolute -top-16 left-0">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-black transition-colors group"
        >
          <div className="p-1 rounded-full group-hover:bg-gray-100 transition-colors">
            <ArrowRight className="h-4 w-4 rotate-180" />
          </div>
          Retour à l&apos;accueil
        </Link>
      </div>

      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 mb-10 group">
        <div className="bg-black rounded-xl p-2 group-hover:bg-[#CCFF00] transition-colors duration-300">
          <Layout className="h-6 w-6 text-[#CCFF00] group-hover:text-black transition-colors duration-300" />
        </div>
        <span className="text-2xl font-bold tracking-tight text-gray-900">ATTABL</span>
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          {isLogin ? 'Bon retour ! 👋' : 'Créez votre compte'}
        </h1>
        <p className="text-gray-500">
          {isLogin
            ? 'Connectez-vous pour gérer votre établissement.'
            : '14 jours d&apos;essai gratuit sur tous les plans.'}
        </p>
      </div>

      {/* OAuth Buttons */}
      <div className="space-y-3 mb-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuthLogin('google')}
          disabled={oauthLoading !== null}
          className="w-full h-12 rounded-xl border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium"
        >
          {oauthLoading === 'google' ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
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
          className="w-full h-12 rounded-xl border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium"
        >
          {oauthLoading === 'azure' ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <MicrosoftIcon />
          )}
          <span className="ml-3">Continuer avec Outlook</span>
        </Button>
      </div>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-gray-500">ou avec email</span>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Restaurant Name (Signup only) */}
        {!isLogin && (
          <div className="space-y-2">
            <Label htmlFor="restaurantName" className="text-gray-700 font-semibold text-sm">
              Nom de l&apos;établissement
            </Label>
            <Input
              id="restaurantName"
              type="text"
              placeholder="Ex: Le Petit Bistrot"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              required
              className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 transition-all rounded-xl"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-gray-700 font-semibold text-sm">
            Adresse e-mail
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="nom@restaurant.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 transition-all rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-gray-700 font-semibold text-sm">
              Mot de passe
            </Label>
            {isLogin && (
              <Link
                href="/forgot-password"
                className="text-sm text-gray-500 hover:text-[#CCFF00] transition-colors"
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
            className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 transition-all rounded-xl"
          />
        </div>

        {/* Plan Selection (Signup only) - Simplified if pre-selected */}
        {!isLogin && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-gray-700 font-semibold text-sm">
                {urlPlan ? 'Votre plan sélectionné' : 'Choisissez votre plan'}
              </Label>
              {urlPlan && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPlan(selectedPlan === 'essentiel' ? 'premium' : 'essentiel')
                  }
                  className="text-xs font-bold text-[#CCFF00] hover:underline"
                >
                  Modifier
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedPlan('essentiel')}
                className={`p-4 rounded-xl border-2 text-left transition-all active:scale-[0.98] ${
                  selectedPlan === 'essentiel'
                    ? 'border-[#CCFF00] bg-[#CCFF00]/10 ring-2 ring-[#CCFF00]/20'
                    : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                }`}
              >
                <div className="font-bold text-gray-900 leading-none mb-1">Essentiel</div>
                <div className="text-xs text-gray-500">39 800 F / mois</div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPlan('premium')}
                className={`p-4 rounded-xl border-2 text-left transition-all active:scale-[0.98] ${
                  selectedPlan === 'premium'
                    ? 'border-[#CCFF00] bg-[#CCFF00]/10 ring-2 ring-[#CCFF00]/20'
                    : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                }`}
              >
                <div className="font-bold text-gray-900 leading-none mb-1">Prime</div>
                <div className="text-xs text-gray-500">79 800 F / mois</div>
              </button>
            </div>
          </div>
        )}

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Alert
              variant="destructive"
              className="bg-red-50 text-red-800 border-red-200 rounded-xl"
            >
              <AlertDescription className="font-medium">{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        <Button
          type="submit"
          className="w-full h-12 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold rounded-xl shadow-lg shadow-[#CCFF00]/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {isLogin ? 'Connexion...' : 'Création du compte...'}
            </>
          ) : (
            <>
              {isLogin ? 'Se connecter' : 'Créer mon compte'}
              <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </form>

      {/* Footer Link */}
      <div className="mt-8 pt-6 border-t border-gray-100 text-center">
        <p className="text-sm text-gray-500">
          {isLogin ? 'Pas encore de compte ?' : 'Déjà un compte ?'}{' '}
          <Link
            href={isLogin ? '/signup' : '/login'}
            className="font-bold text-black border-b-2 border-[#CCFF00] hover:bg-[#CCFF00] transition-all px-1"
          >
            {isLogin ? 'Inscrivez-vous gratuitement' : 'Connectez-vous ici'}
          </Link>
        </p>
      </div>
    </motion.div>
  );
}

export { AuthForm };
