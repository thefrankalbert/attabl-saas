import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { SubscriptionManager } from '@/components/tenant/SubscriptionManager';

export default async function SubscriptionPage() {
  const supabase = await createClient();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  // Récupérer le tenant et l'email du propriétaire (si possible)
  // Note: Idéalement, on devrait récupérer l'email de l'user courant ou celui stocké dans tenant.users
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-600">Restaurant non trouvé</h2>
      </div>
    );
  }

  // Pour l'instant, on mock l'email s'il n'est pas dispo, le checkout demandera
  // En production, il faut récupérer l'email de l'utilisateur connecté via auth.users
  const { data: { user } } = await supabase.auth.getUser();
  const tenantWithEmail = { ...tenant, email: user?.email };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Gestion de l&apos;abonnement</h1>
      <SubscriptionManager tenant={tenantWithEmail} />
    </div>
  );
}
