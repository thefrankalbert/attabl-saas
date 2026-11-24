import type { SupabaseClient } from '@supabase/supabase-js';

import { matchesSearch, normalizeSearch } from '@/lib/utils/normalize-search';
import type { MenuItem } from '@/types/admin.types';
import { ServiceError } from './errors';

/** Nombre maximal de plats renvoyes pour un terme. */
export const MENU_SEARCH_MAX_RESULTS = 50;

/** Taille d'une page de lecture (plafond `max_rows` de PostgREST). */
const SCAN_PAGE_SIZE = 1000;
/** Garde-fou: au-dela de 10 000 plats disponibles, la recherche s'arrete la. */
const SCAN_MAX_PAGES = 10;

const FULL_COLUMNS = `
  id, category_id, name, name_en, description, description_en,
  price, prices, image_url, is_available, is_featured, is_vegetarian, is_spicy, allergens, calories, rating, rating_count, created_at,
  category:categories(id, name, name_en),
  options:item_options(id, menu_item_id, name_fr, name_en, is_default, display_order, created_at),
  price_variants:item_price_variants(id, menu_item_id, variant_name_fr, variant_name_en, price, prices, display_order:sort_order, created_at),
  modifiers:item_modifiers(id, menu_item_id, name, name_en, price, is_available, display_order, created_at)
`;

interface SearchableRow {
  id: string;
  name: string | null;
  name_en: string | null;
  description: string | null;
}

/**
 * Recherche convive dans TOUTE la carte d'un restaurant (B4).
 *
 * Avant: la route servait les 150 premiers plats par ordre alphabetique et le
 * navigateur filtrait dedans; un plat au-dela du 150e n'etait jamais trouve.
 * Ici la recherche se fait sur tous les plats disponibles: une lecture legere
 * (id, nom, nom anglais, description) compare le terme sans accents ni casse, comme
 * l'ecran le faisait, puis seules les fiches completes des plats trouves sont
 * lues. Les plats sont lus avec le client anon, sous RLS.
 */
export function createMenuSearchService(supabase: SupabaseClient) {
  return {
    async search(tenantId: string, query: string): Promise<MenuItem[]> {
      const term = normalizeSearch(query.trim());
      if (!term) return [];

      const matchIds: string[] = [];
      for (let page = 0; page < SCAN_MAX_PAGES; page += 1) {
        const from = page * SCAN_PAGE_SIZE;
        const { data, error } = await supabase
          .from('menu_items')
          .select('id, name, name_en, description')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .eq('is_available', true)
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + SCAN_PAGE_SIZE - 1);
        if (error) throw new ServiceError('Menu search scan failed', 'INTERNAL', error);

        const rows = (data ?? []) as SearchableRow[];
        for (const row of rows) {
          if (matchIds.length >= MENU_SEARCH_MAX_RESULTS) break;
          if (matchesSearch(row, term)) matchIds.push(row.id);
        }
        if (matchIds.length >= MENU_SEARCH_MAX_RESULTS || rows.length < SCAN_PAGE_SIZE) break;
      }

      if (matchIds.length === 0) return [];

      // Les identifiants viennent du parcours ci-dessus, deja borne au restaurant,
      // aux plats disponibles et non supprimes: ces deux filtres ne sont pas
      // repetes ici (les repeter masquait leur absence au parcours, contre-audit
      // 1). `tenant_id` reste, par regle multi-restaurant.
      const { data, error } = await supabase
        .from('menu_items')
        .select(FULL_COLUMNS)
        .eq('tenant_id', tenantId)
        .in('id', matchIds)
        .order('name', { ascending: true });
      if (error) throw new ServiceError('Menu search fetch failed', 'INTERNAL', error);

      return (data ?? []) as unknown as MenuItem[];
    },
  };
}
