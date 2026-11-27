import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildReorderLine,
  type ReorderCatalogEntry,
  type ReorderLine,
  type ReorderLineInput,
} from '@/lib/utils/order-line-display';

export interface ReorderPlan {
  lines: ReorderLine[];
  /** Plats a tailles dont la taille commandee n'est plus a la carte. */
  toChooseAgain: string[];
}

/**
 * Prepare "Commander a nouveau" pour les DEUX boutons de la vitrine (detail
 * d'une commande, liste des commandes): lit les tailles et options ACTUELLES
 * des plats commandes, puis reconstruit chaque ligne avec sa taille, son
 * option, ses supplements et sa note (audit d'equipe du 2026-11-27, convive
 * #48). Les lignes sans plat (`menu_item_id` nul, plat supprime) sont ecartees:
 * le serveur refuserait un identifiant qui n'est pas un plat. Rend `null` si la
 * carte n'a pas pu etre lue.
 */
export async function planReorder(
  supabase: SupabaseClient,
  tenantId: string,
  items: Array<Omit<ReorderLineInput, 'menu_item_id'> & { menu_item_id?: string | null }>,
): Promise<ReorderPlan | null> {
  const lines = items.filter(
    (item): item is ReorderLineInput =>
      typeof item.menu_item_id === 'string' && !!item.menu_item_id,
  );
  const ids = Array.from(new Set(lines.map((l) => l.menu_item_id)));
  const catalog = new Map<string, ReorderCatalogEntry>();

  if (ids.length > 0) {
    const [variantsRes, optionsRes] = await Promise.all([
      supabase
        .from('item_price_variants')
        .select('id, menu_item_id, variant_name_fr, variant_name_en, price')
        .eq('tenant_id', tenantId)
        .in('menu_item_id', ids),
      supabase
        .from('item_options')
        .select('menu_item_id, name_fr, name_en')
        .eq('tenant_id', tenantId)
        .in('menu_item_id', ids),
    ]);
    if (variantsRes.error || optionsRes.error) return null;

    const entry = (id: string): ReorderCatalogEntry => {
      const existing = catalog.get(id);
      if (existing) return existing;
      const created: ReorderCatalogEntry = { variants: [], options: [] };
      catalog.set(id, created);
      return created;
    };
    for (const v of variantsRes.data ?? []) {
      entry(v.menu_item_id).variants.push({
        id: v.id,
        name_fr: v.variant_name_fr,
        name_en: v.variant_name_en,
        price: v.price,
      });
    }
    for (const o of optionsRes.data ?? []) {
      entry(o.menu_item_id).options.push({ name_fr: o.name_fr, name_en: o.name_en });
    }
  }

  const plan: ReorderPlan = { lines: [], toChooseAgain: [] };
  for (const item of lines) {
    const line = buildReorderLine(item, catalog.get(item.menu_item_id));
    if (line) plan.lines.push(line);
    else plan.toChooseAgain.push(item.name);
  }
  return plan;
}
