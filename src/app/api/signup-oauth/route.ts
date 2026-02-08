import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, email, restaurantName, plan } = body;

    if (!userId || !email || !restaurantName) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Generate unique slug
    const baseSlug = restaurantName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('slug', baseSlug)
      .single();

    let finalSlug = baseSlug;
    if (existingTenant) {
      finalSlug = `${baseSlug}-${Math.floor(Math.random() * 1000)}`;
    }

    // Calculate trial end date (14 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    // Create tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        slug: finalSlug,
        name: restaurantName,
        subscription_plan: plan || 'essentiel',
        subscription_status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
        is_active: true,
      })
      .select()
      .single();

    if (tenantError) {
      return NextResponse.json({ error: `Erreur Tenant: ${tenantError.message}` }, { status: 500 });
    }

    // Create admin user
    const { error: adminError } = await supabase.from('admin_users').insert({
      tenant_id: tenant.id,
      user_id: userId,
      email,
      full_name: restaurantName,
      role: 'superadmin',
      is_active: true,
    });

    if (adminError) {
      await supabase.from('tenants').delete().eq('id', tenant.id);
      return NextResponse.json({ error: `Erreur Admin: ${adminError.message}` }, { status: 500 });
    }

    // Create default venue
    await supabase.from('venues').insert({
      tenant_id: tenant.id,
      slug: 'main',
      name: 'Salle principale',
      name_en: 'Main Dining',
      type: 'restaurant',
      is_active: true,
    });

    return NextResponse.json({
      success: true,
      slug: finalSlug,
      tenantId: tenant.id,
    });
  } catch (error) {
    console.error('OAuth Signup error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
