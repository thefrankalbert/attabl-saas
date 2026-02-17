'use client';

import { useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Check } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';

// --- Icons ---
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

const MicrosoftIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 23 23">
    <path fill="#f35325" d="M1 1h10v10H1z" />
    <path fill="#81bc06" d="M12 1h10v10H12z" />
    <path fill="#05a6f0" d="M1 12h10v10H1z" />
    <path fill="#ffba08" d="M12 12h10v10H12z" />
  </svg>
);

// --- Right Visual Panel (dark with social proof) ---
const features = [
  'Menu digital intelligent avec QR code',
  'Commandes et stocks en temps réel',
  'Analytics et rapports avancés',
  'Multi-devises (XAF, EUR, USD)',
];

function VisualPanel() {
  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full overflow-hidden rounded-[2rem]">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-black to-neutral-900" />
      <div className="absolute inset-0 bg-[url('/images/restaurant-ambiance.jpg')] bg-cover bg-center opacity-20" />
      <div className="absolute inset-0 bg-black/40" />

      {/* Subtle lime glow */}
      <div className="absolute top-1/4 right-1/3 w-[400px] h-[400px] bg-[#CCFF00]/5 rounded-full blur-[160px] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-12 lg:px-16 max-w-lg">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight mb-6"
        >
          Marquez votre territoire. Digitalisez votre établissement.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-neutral-400 text-base leading-relaxed mb-10"
        >
          14 jours gratuits. Aucune carte bancaire requise.
        </motion.p>

        {/* Feature points */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col gap-3 text-left w-full max-w-xs"
        >
          {features.map((text, i) => (
            <motion.div
              key={text}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.1 }}
              className="flex items-center gap-3 text-sm text-neutral-400"
            >
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#CCFF00]/10 shrink-0">
                <Check className="h-3 w-3 text-[#CCFF00]" />
              </div>
              <span>{text}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

// --- Frictionless Signup Form ---
function FrictionlessSignupForm() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(searchParams.get('error') || '');
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'azure' | null>(null);

  const supabase = createClient();

  const handleOAuthLogin = async (provider: 'google' | 'azure') => {
    setOauthLoading(provider);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
          queryParams: {
            plan: searchParams.get('plan') || 'essentiel',
            restaurant_name: 'Mon Nouvel Établissement',
          },
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
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantName: 'En attente...',
          email,
          password,
          plan: searchParams.get('plan') || 'essentiel',
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur d'inscription");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        window.location.href = `/login?email=${encodeURIComponent(email)}`;
        return;
      }

      window.location.href = '/onboarding';
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
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
          Commencer gratuitement
        </h1>
        <p className="text-neutral-500 text-sm">
          Inscription rapide — aucun engagement, aucune carte requise.
        </p>
      </div>

      {/* Email + Password Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
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
            className="h-12 bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 rounded-lg transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-neutral-700 font-medium text-sm">
            Mot de passe
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Minimum 8 caractères"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="h-12 pr-20 bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 rounded-lg transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors text-sm"
            >
              {showPassword ? 'Masquer' : 'Afficher'}
            </button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="bg-red-50 text-red-700 border-red-200 rounded-lg">
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          className="w-full h-12 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold rounded-lg shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Création en cours...
            </>
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
          disabled={oauthLoading !== null || loading}
          className="w-full h-12 rounded-lg border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 font-medium transition-all"
        >
          {oauthLoading === 'google' ? (
            <Loader2 className="mr-3 h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          <span className="ml-3">Continuer avec Google</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuthLogin('azure')}
          disabled={oauthLoading !== null || loading}
          className="w-full h-12 rounded-lg border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 font-medium transition-all"
        >
          {oauthLoading === 'azure' ? (
            <Loader2 className="mr-3 h-4 w-4 animate-spin" />
          ) : (
            <MicrosoftIcon />
          )}
          <span className="ml-3">Continuer avec Outlook</span>
        </Button>
      </div>

      {/* Footer */}
      <p className="mt-8 text-center text-sm text-neutral-500">
        Déjà un compte ?{' '}
        <Link href="/login" className="font-semibold text-neutral-900 hover:underline">
          Se connecter
        </Link>
      </p>
    </motion.div>
  );
}

// --- Main Page ---
export default function SignupPage() {
  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* Left — Form on white background */}
      <div className="w-full lg:w-[55%] flex items-center justify-center bg-white px-8 sm:px-16 lg:px-20 py-10">
        <div className="w-full max-w-[420px]">
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-300" />
              </div>
            }
          >
            <FrictionlessSignupForm />
          </Suspense>
        </div>
      </div>

      {/* Right — Dark visual panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[45%] items-center py-6 pr-6 pl-3">
        <VisualPanel />
      </div>
    </div>
  );
}
