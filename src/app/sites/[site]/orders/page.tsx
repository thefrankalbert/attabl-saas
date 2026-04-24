import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import ClientOrders from '@/components/tenant/ClientOrders';
import BottomNav from '@/components/tenant/BottomNav';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ history?: string }>;
}) {
  const { site } = await params;
  const resolvedSearch = await searchParams;
  const showHistory = resolvedSearch.history === 'true';
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
    <div className="h-full bg-white text-[#1A1A1A]">
      {/* Header: sticky back button, same bg as page, no title */}
      <div className="sticky top-0 z-40 bg-white">
        <div className="max-w-lg mx-auto px-3 py-2">
          <Link
            href={showHistory ? `/sites/${tenantSlug}/settings` : `/sites/${tenantSlug}`}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors bg-[#F6F6F6] text-[#1A1A1A]"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 pt-4 pb-28">
        <ClientOrders
          tenantSlug={tenantSlug}
          tenantId={tenant.id}
          currency={tenant.currency || 'XAF'}
          showHistory={showHistory}
        />
      </main>

      <BottomNav tenantSlug={tenantSlug} />
    </div>
  );
}
