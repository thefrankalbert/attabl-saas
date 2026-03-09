import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import SingleOrderClient from '@/components/admin/SingleOrderClient';
import type { Order } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ site: string; id: string }>;
}

export default async function SingleOrderPage({ params }: PageProps) {
  const { site, id } = await params;
  const supabase = await createClient();

  // Resolve tenant from site slug to scope the query
  const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', site).single();

  if (!tenant) {
    notFound();
  }

  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .single();

  if (!order) {
    notFound();
  }

  return <SingleOrderClient order={order as Order} />;
}
