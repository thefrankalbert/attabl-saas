'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
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
      const errorMessage = err instanceof Error ? err.message : 'Erreur de connexion';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Link href="/" className="text-center block mb-4">
            <span className="text-2xl font-bold">ATTABL</span>
          </Link>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>
            Accédez à votre dashboard restaurant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connexion...
                </>
              ) : (
                'Se connecter'
              )}
            </Button>

            <div className="text-sm text-center space-y-2">
              <Link href="/forgot-password" className="text-gray-600 hover:underline block">
                Mot de passe oublié ?
              </Link>
              <p className="text-gray-600">
                Pas encore de compte ?{' '}
                <Link href="/signup" className="text-blue-600 hover:underline">
                  S&apos;inscrire
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
