import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import ClientOrders from '@/components/tenant/ClientOrders';
import BottomNav from '@/components/tenant/BottomNav';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

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

  const t = await getTranslations('tenant');

  return (
    <div className="h-full bg-white" style={{ color: '#1A1A1A' }}>
      {/* Header: 56px, white, no border, no shadow */}
      <header className="sticky top-0 z-40 bg-white" style={{ height: '56px' }}>
        <div className="max-w-lg mx-auto px-4 h-full flex items-center">
          <Link
            href={`/sites/${tenantSlug}/menu`}
            className="p-2 -ml-2 transition-colors"
            style={{ color: '#737373' }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 text-center">
            {/* Section Title: 20px Bold, Text Primary (#1A1A1A) */}
            <h1
              className="font-bold"
              style={{ fontSize: '20px', lineHeight: '28px', color: '#1A1A1A' }}
            >
              {t('navOrders')}
            </h1>
          </div>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-4 pb-28">
        <ClientOrders
          tenantSlug={tenantSlug}
          tenantId={tenant.id}
          currency={tenant.currency || 'XAF'}
        />
      </main>

      <BottomNav tenantSlug={tenantSlug} />
    </div>
  );
}
