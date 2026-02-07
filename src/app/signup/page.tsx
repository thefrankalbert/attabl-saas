'use client';

import { useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import {
  Layout,
  ShieldCheck,
  Zap,
  Check,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight
} from 'lucide-react';
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
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
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

// --- Local Frictionless Signup Form ---
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
            restaurant_name: 'Mon Nouvel Établissement', // Default name for frictionless OAuth
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
      // "Frictionless" values sent to the existing API
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantName: 'En attente...', // Temporary name
          email,
          password,
          plan: searchParams.get('plan') || 'essentiel',
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur d'inscription");

      // Successful signup redirects to onboarding
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
      className="w-full max-w-md mx-auto"
    >
      {/* Back Home */}
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-black mb-12 transition-colors group">
        <ArrowRight className="h-4 w-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
        Retour
      </Link>

      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 mb-10 group w-fit">
        <div className="bg-black rounded-xl p-2 group-hover:bg-[#CCFF00] transition-colors duration-300">
          <Layout className="h-6 w-6 text-[#CCFF00] group-hover:text-black transition-colors duration-300" />
        </div>
        <span className="text-2xl font-bold tracking-tight text-gray-900">ATTABL</span>
      </Link>

      {/* Header */}
      <div className="mb-8 text-left">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Créez votre compte
        </h1>
        <p className="text-gray-500">
          Saisie simple, configuration complète juste après.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-gray-700 font-semibold text-sm pl-1">
            Email professionnel
          </Label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              id="email"
              type="email"
              placeholder="nom@restaurant.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-13 pl-12 bg-gray-50 border-gray-100 focus:bg-white focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/10 rounded-2xl transition-all"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-gray-700 font-semibold text-sm pl-1">
            Mot de passe
          </Label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Minimum 8 caractères"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="h-13 pl-12 pr-12 bg-gray-50 border-gray-100 focus:bg-white focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/10 rounded-2xl transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="bg-red-50 text-red-800 border-red-100 rounded-xl">
            <AlertDescription className="text-xs font-medium">{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          className="w-full h-14 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold text-lg rounded-2xl shadow-lg shadow-[#CCFF00]/20 transition-all hover:scale-[1.01] active:scale-[0.98] mt-4"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Création...
            </>
          ) : (
            <>
              Créer mon compte
              <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </form>

      <div className="relative my-10">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-100" />
        </div>
        <div className="relative flex justify-center text-xs text-gray-400 uppercase tracking-widest">
          <span className="bg-white px-4">ou continuer avec</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuthLogin('google')}
          disabled={oauthLoading !== null || loading}
          className="h-12 rounded-xl border-gray-100 hover:bg-gray-50 font-medium transition-all active:scale-[0.98] flex gap-3"
        >
          {oauthLoading === 'google' ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcon />}
          Google
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuthLogin('azure')}
          disabled={oauthLoading !== null || loading}
          className="h-12 rounded-xl border-gray-100 hover:bg-gray-50 font-medium transition-all active:scale-[0.98] flex gap-3"
        >
          {oauthLoading === 'azure' ? <Loader2 className="h-5 w-5 animate-spin" /> : <MicrosoftIcon />}
          Outlook
        </Button>
      </div>

      <p className="mt-12 text-center text-sm text-gray-500">
        Déjà un compte ?{' '}
        <Link href="/login" className="font-bold text-black border-b-2 border-[#CCFF00] hover:bg-[#CCFF00] transition-all px-1">
          Connectez-vous ici
        </Link>
      </p>
    </motion.div>
  );
}

// --- Main Page Component ---
export default function SignupPage() {
  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-white">
      {/* Left Column: Form */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-20 xl:px-28 bg-white z-10 py-12">
        <Suspense fallback={
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#CCFF00]" />
          </div>
        }>
          <FrictionlessSignupForm />
        </Suspense>
      </div>

      {/* Right Column: Visual / Marketing */}
      <div className="hidden lg:flex relative bg-black overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-900 to-black" />
        <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-[#CCFF00]/10 rounded-full blur-[180px] pointer-events-none" />

        <div className="relative z-10 px-12 text-center max-w-lg">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-sm font-bold text-[#CCFF00] mb-8">
              <Check className="h-4 w-4" />
              14 jours d&apos;essai gratuit. Aucune carte bancaire requise.
            </div>

            <h2 className="text-5xl font-black text-white mb-8 leading-[1.1] tracking-tighter text-balance">
              Commencez votre <span className="text-[#CCFF00]">transformation</span> digitale.
            </h2>

            <div className="space-y-6 text-left inline-block">
              {[
                { text: "Votre établissement en ligne en 2 minutes", icon: Zap },
                { text: "Suivi des flux et commandes en direct", icon: Layout },
                { text: "Transactions client fluides", icon: ShieldCheck }
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="flex items-center gap-4 text-white/90"
                >
                  <div className="h-10 w-10 rounded-xl bg-[#CCFF00]/20 flex items-center justify-center border border-[#CCFF00]/30">
                    <feature.icon className="h-5 w-5 text-[#CCFF00]" />
                  </div>
                  <span className="font-semibold text-lg">{feature.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Footer Branding */}
        <div className="absolute bottom-8 left-8 flex items-center gap-2 text-white/20 text-xs font-bold tracking-widest uppercase">
          <Layout className="h-4 w-4" />
          ATTABL © 2026
        </div>
      </div>
    </div>
  );
}
