import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { restaurantName, email, password, phone, plan } = body;

    // Validation
    if (!restaurantName || !email || !password) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    // Utiliser le client admin pour bypass RLS
    const supabase = createAdminClient();

    // 1. Créer le slug unique
    const baseSlug = restaurantName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Retirer accents
      .replace(/[^a-z0-9]+/g, '-') // Remplacer espaces/caractères spéciaux
      .replace(/^-+|-+$/g, ''); // Retirer tirets début/fin

    // Vérifier si le slug existe déjà
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('slug', baseSlug)
      .single();

    let finalSlug = baseSlug;
    if (existingTenant) {
      // Ajouter un nombre aléatoire si slug existe
      finalSlug = `${baseSlug}-${Math.floor(Math.random() * 1000)}`;
    }

    // 2. Créer l'utilisateur dans Supabase Auth (avec admin client)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirmer l'email
      user_metadata: {
        restaurant_name: restaurantName,
        phone,
      },
    });

    if (authError) {
      return NextResponse.json({ error: `Erreur Auth: ${authError.message}` }, { status: 400 });
    }

    const userId = authData.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Erreur lors de la création du compte' }, { status: 500 });
    }

    // Calculate trial end date (14 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    // 3. Créer le tenant (restaurant)
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        slug: finalSlug,
        name: restaurantName,
        subscription_plan: plan,
        subscription_status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
        is_active: true,
      })
      .select()
      .single();

    if (tenantError) {
      // Rollback: supprimer l'utilisateur créé
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: `Erreur Tenant: ${tenantError.message}` }, { status: 500 });
    }

    // 4. Créer l'admin user
    const { error: adminError } = await supabase.from('admin_users').insert({
      tenant_id: tenant.id,
      user_id: userId,
      email,
      full_name: restaurantName,
      role: 'superadmin',
      is_active: true,
    });

    if (adminError) {
      // Rollback
      await supabase.from('tenants').delete().eq('id', tenant.id);
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: `Erreur Admin: ${adminError.message}` }, { status: 500 });
    }

    // 5. Créer une venue par défaut
    await supabase.from('venues').insert({
      tenant_id: tenant.id,
      slug: 'main',
      name: 'Salle principale',
      name_en: 'Main Dining',
      type: 'restaurant',
      is_active: true,
    });

    // 6. TODO: Envoyer email de bienvenue (Resend)
    // await sendWelcomeEmail(email, tenant.slug);

    // Succès !
    return NextResponse.json({
      success: true,
      slug: finalSlug,
      tenantId: tenant.id,
      message: 'Restaurant créé avec succès !',
    });
  } catch (error: unknown) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
