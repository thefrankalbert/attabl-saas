'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowRight, Layout, ShieldCheck, Zap, Users } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('tenant_id, tenants(slug)')
        .eq('user_id', authData.user.id)
        .single();

      if (!adminUser) {
        throw new Error('Aucun restaurant associé à ce compte');
      }

      const tenantsData = adminUser.tenants as unknown;
      let tenantSlug: string | undefined;

      if (Array.isArray(tenantsData) && tenantsData.length > 0) {
        tenantSlug = (tenantsData[0] as { slug: string }).slug;
      } else if (tenantsData && typeof tenantsData === 'object') {
        tenantSlug = (tenantsData as { slug: string }).slug;
      }

      if (!tenantSlug) {
        throw new Error('Restaurant non trouvé');
      }

      const isDev = window.location.hostname === 'localhost';
      if (isDev) {
        window.location.href = `http://${tenantSlug}.localhost:3000/admin`;
      } else {
        window.location.href = `https://${tenantSlug}.attabl.com/admin`;
      }

    } catch (err: unknown) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur de connexion';
      if (errorMessage.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-white">
      {/* Left Column: Form (Soft & Welcoming) */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-20 xl:px-28 bg-white z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto w-full max-w-md"
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 mb-12 group">
            <div className="bg-black rounded-xl p-2 group-hover:bg-[#CCFF00] transition-colors duration-300">
              <Layout className="h-6 w-6 text-[#CCFF00] group-hover:text-black transition-colors duration-300" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-gray-900">ATTABL</span>
          </Link>

          {/* Header */}
          <div className="mb-10">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-3">
              Bon retour ! 👋
            </h1>
            <p className="text-gray-500 text-lg">
              Connectez-vous pour gérer votre établissement.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
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
                className="h-14 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 transition-all rounded-xl text-base placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-gray-700 font-semibold text-sm">
                  Mot de passe
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-gray-500 hover:text-[#CCFF00] transition-colors"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-14 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00]/20 transition-all rounded-xl text-base"
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Alert variant="destructive" className="bg-red-50 text-red-800 border-red-200 rounded-xl">
                  <AlertDescription className="font-medium">{error}</AlertDescription>
                </Alert>
              </motion.div>
            )}

            <Button
              type="submit"
              className="w-full h-14 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-bold rounded-xl shadow-lg shadow-[#CCFF00]/30 transition-all hover:scale-[1.02] active:scale-[0.98] text-base"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          {/* Footer Link */}
          <div className="mt-10 pt-8 border-t border-gray-100 text-center">
            <p className="text-gray-500">
              Pas encore de compte ?{' '}
              <Link href="/signup" className="font-bold text-black hover:text-[#CCFF00] transition-colors">
                Créer un compte
              </Link>
            </p>
          </div>
        </motion.div>
      </div>

      {/* Right Column: Visual Showcase (Neon Lime Theme, Soft) */}
      <div className="hidden lg:flex relative bg-black overflow-hidden items-center justify-center">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-900 to-black" />

        {/* Decorative Glow */}
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-[#CCFF00]/20 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-[#CCFF00]/10 rounded-full blur-[120px] pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 px-12 text-center max-w-lg">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#CCFF00]/30 bg-[#CCFF00]/10 text-sm font-bold text-[#CCFF00] mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCFF00]"></span>
              </span>
              Plateforme en ligne
            </div>

            {/* Headline */}
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
              Gérez votre établissement{' '}
              <span className="text-[#CCFF00]">simplement.</span>
            </h2>

            <p className="text-lg text-gray-400 mb-12 leading-relaxed">
              Menu digital, commandes, paiements, statistiques. Tout ce dont vous avez besoin, réuni dans une seule interface.
            </p>

            {/* Feature Pills */}
            <div className="flex flex-wrap justify-center gap-4">
              {[
                { icon: ShieldCheck, text: "Sécurisé" },
                { icon: Zap, text: "Rapide" },
                { icon: Users, text: "Simple" },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/80 text-sm font-medium"
                >
                  <item.icon className="h-4 w-4 text-[#CCFF00]" />
                  {item.text}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Corner Decoration */}
        <div className="absolute bottom-8 left-8 flex items-center gap-2 text-white/30 text-xs font-medium">
          <Layout className="h-4 w-4" />
          ATTABL © 2026
        </div>
      </div>
    </div>
  );
}
