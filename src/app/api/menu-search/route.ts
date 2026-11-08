import { createClient } from '@/lib/supabase/server';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { menuSearchLimiter, getClientIp } from '@/lib/rate-limit';
import { TENANT_LOCK_COLUMNS, tenantLockReason } from '@/lib/billing/tenant-lock';
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
    // CLE PAR RESTAURANT ET PAR ADRESSE. Les convives d'un lieu partagent le
    // Wi-Fi du restaurant, donc une seule adresse: compter par adresse seule
    // faisait qu'un service charge epuisait le compartiment, et le refus
    // tombait sur le client suivant.
    //
    // LE SLUG PASSE PAR `readTenantSlug`, jamais par une lecture directe de
    // l'en-tete: un garde anti-regression du depot l'interdit, et il a raison -
    // seul le helper distingue l'en-tete injecte par le middleware de l'indice
    // fourni par le client.
    //
    // Le regroupement IPv6 (`grouperAdresse`) arrive par une branche deja
    // fusionnee; il sera applique ici dans la foulee. L'essentiel de la
    // correction est la cle composee, qui ne depend pas de lui.
    const headersList = await headers();
    const ip = getClientIp(request);
    const slugDepuisEntete = readTenantSlug(headersList);
    const { success: allowed } = await menuSearchLimiter.check(
      `${slugDepuisEntete.slug ?? 'inconnu'}:${ip}`,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: FALLBACK_ERRORS.rateLimited },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const tenantSlug = slugDepuisEntete.slug;
    if (!tenantSlug) {
      return NextResponse.json({ error: FALLBACK_ERRORS.tenantNotIdentified }, { status: 400 });
    }

    const supabase = await createClient();

    // B-2: cette route etait la QUATRIEME surface qui sert la carte d'un tenant,
    // et la seule des quatre a ne lire que `is_active`. Elle sert jusqu'a 150
    // articles avec leurs prix: elle doit refuser exactement ce que refusent la
    // vitrine, la prise de commande et le tableau de bord. La condition est
    // celle de `validateTenant` (src/services/order/order-queries.ts):
    // `deleted_at` filtre a la requete, puis `suspended_at` (suspension
    // plateforme) et le statut d'abonnement, parce qu'un tenant `frozen` peut
    // tres bien porter `is_active = true` (c'est ce que `unsuspendTenant`
    // produit).
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(`id, ${TENANT_LOCK_COLUMNS}`)
      .eq('slug', tenantSlug)
      .is('deleted_at', null)
      .single();

    if (tenantError || !tenant || tenantLockReason(tenant)) {
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
