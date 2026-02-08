import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Get the user's tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select(
        `
        tenant_id,
        tenants (
          id,
          slug,
          name,
          establishment_type,
          address,
          city,
          country,
          phone,
          table_count,
          logo_url,
          primary_color,
          secondary_color,
          description,
          onboarding_completed
        )
      `,
      )
      .eq('user_id', user.id)
      .single();

    if (!adminUser || !adminUser.tenants) {
      return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });
    }

    const tenant = Array.isArray(adminUser.tenants) ? adminUser.tenants[0] : adminUser.tenants;

    // Get onboarding progress
    const { data: progress } = await supabase
      .from('onboarding_progress')
      .select('*')
      .eq('tenant_id', tenant.id)
      .single();

    return NextResponse.json({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      step: progress?.step || 1,
      completed: progress?.completed || false,
      data: {
        establishmentType: tenant.establishment_type || 'restaurant',
        address: tenant.address || '',
        city: tenant.city || '',
        country: tenant.country || 'Tchad',
        phone: tenant.phone || '',
        tableCount: tenant.table_count || 10,
        logoUrl: tenant.logo_url || '',
        primaryColor: tenant.primary_color || '#CCFF00',
        secondaryColor: tenant.secondary_color || '#000000',
        description: tenant.description || '',
      },
    });
  } catch (error) {
    console.error('Onboarding state error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
