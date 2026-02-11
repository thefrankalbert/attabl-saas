import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import ClientOrders from '@/components/tenant/ClientOrders';
import BottomNav from '@/components/tenant/BottomNav';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default async function OrdersPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  if (!tenantSlug) return notFound();

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) return notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/sites/${tenantSlug}`} className="p-2 -ml-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Mes Commandes</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <ClientOrders
          tenantSlug={tenantSlug}
          tenantId={tenant.id}
          currency={tenant.currency || 'XAF'}
        />
      </main>

      <BottomNav tenantSlug={tenantSlug} primaryColor={tenant.primary_color || '#000000'} />
    </div>
  );
}
