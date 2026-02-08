import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { data } = body;

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
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (!adminUser) {
      return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });
    }

    const tenantId = adminUser.tenant_id;

    // Final update with all data
    await supabase
      .from('tenants')
      .update({
        establishment_type: data.establishmentType,
        address: data.address,
        city: data.city,
        country: data.country,
        phone: data.phone,
        table_count: data.tableCount,
        logo_url: data.logoUrl,
        primary_color: data.primaryColor,
        secondary_color: data.secondaryColor,
        description: data.description,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    // Mark progress as completed
    await supabase.from('onboarding_progress').upsert(
      {
        tenant_id: tenantId,
        step: 4,
        completed: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'tenant_id',
      },
    );

    // Create category and menu items if provided during onboarding
    if (
      data.menuItems &&
      data.menuItems.length > 0 &&
      data.menuItems.some((item: { name: string }) => item.name)
    ) {
      // Get category name from first item or use default
      const categoryName = data.menuItems[0]?.category || 'Menu';

      // Create the category
      const { data: category } = await supabase
        .from('categories')
        .insert({
          tenant_id: tenantId,
          name: categoryName,
          sort_order: 1,
        })
        .select()
        .single();

      if (category) {
        // Filter out empty items and create menu items
        const validItems = data.menuItems.filter(
          (item: { name: string; price: number }) => item.name && item.name.trim(),
        );

        if (validItems.length > 0) {
          await supabase.from('menu_items').insert(
            validItems.map((item: { name: string; price: number }) => ({
              tenant_id: tenantId,
              category_id: category.id,
              name: item.name,
              price: item.price || 0,
              is_available: true,
            })),
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      slug: data.tenantSlug,
    });
  } catch (error) {
    console.error('Onboarding complete error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
