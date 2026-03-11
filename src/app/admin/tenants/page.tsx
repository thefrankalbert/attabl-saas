import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import TenantsPageClient from './tenants-page-client';

export default async function TenantsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if the user has super_admin or owner role in any tenant
  const { data: adminUsers } = await supabase
    .from('admin_users')
    .select('is_super_admin, role')
    .eq('user_id', user.id);

  const isSuperAdmin = (adminUsers || []).some(
    (au) => au.is_super_admin === true || au.role === 'super_admin',
  );

  const isOwner = (adminUsers || []).some((au) => au.role === 'owner');

  // Only super admins and owners can access this page
  if (!isSuperAdmin && !isOwner) {
    notFound();
  }

  return <TenantsPageClient />;
}
