import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { menuSearchLimiter, getClientIp } from '@/lib/rate-limit';
import type { MenuItem } from '@/types/admin.types';

const FALLBACK_ERRORS = {
  rateLimited: 'Trop de requetes. Reessayez plus tard.',
  tenantNotIdentified: 'Tenant non identifie',
  serverError: 'Erreur serveur',
};

// Lazy search corpus: full menu items (limit 150) loaded on first search open
// instead of during the home page server render. Tenant derived from the
// x-tenant-slug header injected by the middleware, never from a client param.
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const { success: allowed } = await menuSearchLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: FALLBACK_ERRORS.rateLimited },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');
    if (!tenantSlug) {
      return NextResponse.json({ error: FALLBACK_ERRORS.tenantNotIdentified }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, is_active')
      .eq('slug', tenantSlug)
      .single();

    if (tenantError || !tenant || !tenant.is_active) {
      return NextResponse.json({ error: FALLBACK_ERRORS.tenantNotIdentified }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('menu_items')
      .select(
        `
        id, category_id, name, name_en, description, description_en,
        price, prices, image_url, is_available, is_featured, is_vegetarian, is_spicy, allergens, calories, rating, rating_count, created_at,
        category:categories(id, name, name_en),
        options:item_options(id, menu_item_id, name_fr, name_en, is_default, display_order, created_at),
        price_variants:item_price_variants(id, menu_item_id, variant_name_fr, variant_name_en, price, prices, display_order:sort_order, created_at),
        modifiers:item_modifiers(id, menu_item_id, name, name_en, price, is_available, display_order, created_at)
      `,
      )
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .eq('is_available', true)
      .order('name', { ascending: true })
      .limit(150);

    if (error) {
      logger.error('Menu search API query failed', error);
      return NextResponse.json({ error: FALLBACK_ERRORS.serverError }, { status: 500 });
    }

    return NextResponse.json({ items: (data || []) as unknown as MenuItem[] });
  } catch (error) {
    logger.error('Menu search API error', error);
    return NextResponse.json({ error: FALLBACK_ERRORS.serverError }, { status: 500 });
  }
}
