import { createClient } from '@/lib/supabase/server';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { menuSearchLimiter, getClientIp, grouperAdresse } from '@/lib/rate-limit';
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
    // COMPTEUR PAR ADRESSE SEULE, et le plafond est releve a 300 par minute.
    //
    // POURQUOI PAS UNE CLE PAR RESTAURANT. J'avais compose la cle avec le slug
    // du restaurant, pour qu'un service charge n'epuise pas le compartiment des
    // autres. Deux revues successives ont montre que c'etait contournable, et la
    // seconde avait raison sur le fond: `src/proxy.ts` injecte `x-tenant-slug` a
    // partir du SOUS-DOMAINE sans verifier que le restaurant existe (ligne 436),
    // et le domaine accepte un sous-domaine joker. Un en-tete "de confiance" ne
    // prouve donc PAS l'existence du restaurant: il suffisait de changer de
    // sous-domaine pour obtenir un compartiment neuf a volonte, et echapper
    // entierement a la limite.
    //
    // Le benefice reel venait du CHIFFRE, pas de la composition: les convives
    // d'un lieu sont tous derriere le Wi-Fi du restaurant, donc une seule
    // adresse, et 60 par minute suffisait a ce qu'un service charge se refuse
    // lui-meme - le message tombant sur le client en train de commander. 300 par
    // minute et par adresse corrige cela sans ouvrir aucune porte.
    const headersList = await headers();
    // Regroupement par /64 en IPv6: un abonne ordinaire dispose de milliards
    // d'adresses, donc compter par adresse exacte ne le limiterait en rien.
    const ip = grouperAdresse(getClientIp(request));
    const { success: allowed } = await menuSearchLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: FALLBACK_ERRORS.rateLimited },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const slugDepuisEntete = readTenantSlug(headersList);
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
