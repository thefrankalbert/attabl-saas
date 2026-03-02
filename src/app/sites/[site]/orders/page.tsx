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
    <div className="min-h-screen bg-app-bg">
      <header className="sticky top-0 z-40">
        <div className="absolute inset-0 bg-app-card/80 backdrop-blur-xl border-b border-app-border" />
        <div className="relative container mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href={`/sites/${tenantSlug}`}
            className="p-2 -ml-2 hover:bg-app-hover rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-app-text-secondary" />
          </Link>
          <h1 className="text-lg font-bold text-app-text">Mes Commandes</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-28">
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
