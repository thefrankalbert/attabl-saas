'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Building2, ExternalLink, Shield, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  subscription_status: string;
  subscription_plan: string;
  is_active: boolean;
}

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkAccessAndLoadTenants() {
      // Vérifier l'utilisateur
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Vérifier si super admin
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('is_super_admin, role')
        .eq('user_id', user.id)
        .single();

      const isAdmin = adminUser?.is_super_admin === true || adminUser?.role === 'super_admin';
      setIsSuperAdmin(isAdmin);

      if (!isAdmin) {
        router.push('/login?error=unauthorized');
        return;
      }

      // Charger tous les tenants
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('id, slug, name, subscription_status, subscription_plan, is_active')
        .order('name');

      setTenants(tenantsData || []);
      setLoading(false);
    }

    checkAccessAndLoadTenants();
  }, [supabase, router]);

  const handleSelectTenant = (slug: string) => {
    const isDev = window.location.hostname === 'localhost';
    if (isDev) {
      window.location.href = `http://${slug}.localhost:3000/admin`;
    } else {
      window.location.href = `https://${slug}.attabl.com/admin`;
    }
  };

  const handleViewMenu = (slug: string) => {
    const isDev = window.location.hostname === 'localhost';
    if (isDev) {
      window.location.href = `http://${slug}.localhost:3000`;
    } else {
      window.location.href = `https://${slug}.attabl.com`;
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#CCFF00]" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-black rounded-xl p-3">
              <Shield className="h-6 w-6 text-[#CCFF00]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
              <p className="text-gray-500">Accès universel à tous les établissements</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>

        {/* Alert */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-8">
          <p className="text-yellow-800 text-sm font-medium">
            Mode Super Admin actif. Vous avez accès à tous les établissements pour les tests.
          </p>
        </div>

        {/* Tenants Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map((tenant) => (
            <Card key={tenant.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-100 rounded-lg p-2">
                      <Building2 className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{tenant.name}</CardTitle>
                      <CardDescription className="text-xs">{tenant.slug}</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={tenant.is_active ? 'default' : 'secondary'}
                    className={tenant.is_active ? 'bg-green-100 text-green-800' : ''}
                  >
                    {tenant.is_active ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="outline" className="text-xs">
                    {tenant.subscription_plan}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      tenant.subscription_status === 'active'
                        ? 'border-green-500 text-green-700'
                        : tenant.subscription_status === 'trial'
                        ? 'border-blue-500 text-blue-700'
                        : 'border-gray-500'
                    }`}
                  >
                    {tenant.subscription_status}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleSelectTenant(tenant.slug)}
                    className="flex-1 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-medium"
                  >
                    Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleViewMenu(tenant.slug)}
                    className="gap-1"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Menu
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {tenants.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Aucun établissement trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
}
