'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';

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

      // Login avec Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      // Récupérer le restaurant de l'admin
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('tenant_id, tenants(slug)')
        .eq('user_id', authData.user.id)
        .single();

      if (!adminUser) {
        throw new Error('Aucun restaurant associé à ce compte');
      }

      // Extraire le slug du tenant (gérer array ou object)
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

      // Rediriger vers le dashboard du restaurant
      // En dev, utiliser localhost, en prod utiliser attabl.com
      const isDev = window.location.hostname === 'localhost';
      if (isDev) {
        window.location.href = `http://${tenantSlug}.localhost:3000/admin`;
      } else {
        window.location.href = `https://${tenantSlug}.attabl.com/admin`;
      }

    } catch (err: unknown) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur de connexion';
      // Traduction basique des erreurs courantes
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
    <div className="min-h-screen w-full grid lg:grid-cols-2">
      {/* Left Column: Form */}
      <div className="flex flex-col justify-center px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24 bg-white z-10">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="mb-10">
            <Link href="/" className="flex items-center gap-2 mb-8 group">
              <div className="h-10 w-10 bg-[#007bff] rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200">
                A
              </div>
              <span className="text-2xl font-bold tracking-tight text-gray-900">ATTABL</span>
            </Link>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
              Bon retour !
            </h2>
            <p className="text-gray-500 text-sm">
              Connectez-vous pour gérer votre restaurant.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700 font-medium">Email professionnel</Label>
              <Input
                id="email"
                type="email"
                placeholder="nom@restaurant.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#007bff] transition-colors rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-gray-700 font-medium">Mot de passe</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-[#007bff] hover:text-blue-700 transition-colors"
                >
                  Oublié ?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#007bff] transition-colors rounded-xl"
              />
            </div>

            {error && (
              <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200 animate-in fade-in slide-in-from-top-2">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full h-12 bg-[#007bff] hover:bg-[#0069d9] text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:translate-y-[-1px] active:translate-y-[1px]"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Connexion...
                </>
              ) : (
                <>
                  Se connecter <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-10 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Pas encore client ?{' '}
              <Link href="/signup" className="font-semibold text-[#007bff] hover:text-blue-700 transition-colors">
                Démarrer l&apos;essai gratuit
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right Column: Visual Showcase */}
      <div className="hidden lg:block relative bg-gray-50 overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[600px] h-[600px] bg-blue-100/50 rounded-full blur-3xl opacity-60" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-[600px] h-[600px] bg-green-100/50 rounded-full blur-3xl opacity-60" />

        <div className="h-full flex flex-col justify-center items-center relative z-10 px-12">

          <div className="max-w-xl text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-gray-200 text-xs font-semibold text-gray-600 mb-6 shadow-sm">
              <span className="flex h-2 w-2 rounded-full bg-[#4CAF50]"></span>
              Nouveau: Room Service 2.0
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-4 leading-tight">
              Gérez votre restaurant comme un <span className="text-[#007bff]">chef étoilé.</span>
            </h1>
            <p className="text-lg text-gray-500">
              La plateforme tout-en-un pour digitaliser vos menus, commandes et paiements.
            </p>
          </div>

          <div className="relative w-full max-w-[600px] perspective-1000">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white ring-1 ring-gray-900/5 transform rotate-y-12 rotate-x-6 hover:rotate-0 transition-all duration-700 ease-out">
              <Image
                src="/dashboard-mockup.png"
                alt="Attabl Dashboard"
                width={1200}
                height={800}
                className="w-full h-auto object-cover"
                priority
              />
              {/* Overlay Gradient */}
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            </div>

            {/* Floating Badge */}
            <div className="absolute -right-8 bottom-12 bg-white p-4 rounded-2xl shadow-xl border border-gray-100 animate-bounce-slow">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Revenus du jour</p>
                  <p className="text-lg font-bold text-gray-900">+1,420.50 €</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
