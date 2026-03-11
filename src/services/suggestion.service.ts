import type { SupabaseClient } from '@supabase/supabase-js';
import type { SuggestionType } from '@/types/inventory.types';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  is_available: boolean;
}

interface GeneratedSuggestion {
  menu_item_id: string;
  suggested_item_id: string;
  suggestion_type: SuggestionType;
  description: string | null;
}

/**
 * Auto-generate suggestions based on menu items:
 * - Pairings: items from different categories at similar price points
 * - Upsells: 20-50% more expensive item in same category
 * - Alternatives: similar price in same category
 */
export function generateSuggestions(items: MenuItem[]): GeneratedSuggestion[] {
  const suggestions: GeneratedSuggestion[] = [];
  const byCategory = new Map<string, MenuItem[]>();

  for (const item of items) {
    if (!item.category_id || !item.is_available) continue;
    const list = byCategory.get(item.category_id) || [];
    list.push(item);
    byCategory.set(item.category_id, list);
  }

  const categories = [...byCategory.keys()];

  for (const item of items) {
    if (!item.category_id || !item.is_available) continue;

    const sameCategory = byCategory.get(item.category_id) || [];

    // Upsells: 20-50% more expensive in same category
    const upsellCandidates = sameCategory.filter(
      (c) => c.id !== item.id && c.price > item.price * 1.2 && c.price <= item.price * 1.5,
    );
    if (upsellCandidates.length > 0) {
      const best = upsellCandidates.sort((a, b) => a.price - b.price)[0];
      suggestions.push({
        menu_item_id: item.id,
        suggested_item_id: best.id,
        suggestion_type: 'upsell',
        description: null,
      });
    }

    // Alternatives: same category, price within 30%
    const altCandidates = sameCategory.filter(
      (c) => c.id !== item.id && Math.abs(c.price - item.price) <= item.price * 0.3,
    );
    if (altCandidates.length > 0) {
      const best = altCandidates[0];
      suggestions.push({
        menu_item_id: item.id,
        suggested_item_id: best.id,
        suggestion_type: 'alternative',
        description: null,
      });
    }

    // Pairings: item from a different category
    const otherCategories = categories.filter((c) => c !== item.category_id);
    if (otherCategories.length > 0) {
      const targetCategory = otherCategories[0];
      const targets = byCategory.get(targetCategory) || [];
      if (targets.length > 0) {
        const closest = [...targets].sort(
          (a, b) => Math.abs(a.price - item.price) - Math.abs(b.price - item.price),
        )[0];
        suggestions.push({
          menu_item_id: item.id,
          suggested_item_id: closest.id,
          suggestion_type: 'pairing',
          description: null,
        });
      }
    }
  }

  // Deduplicate: same source->target pair
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = `${s.menu_item_id}-${s.suggested_item_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Generate and persist auto-suggestions for a tenant.
 */
export async function generateAndSaveSuggestions(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const { data: items, error: itemsError } = await supabase
    .from('menu_items')
    .select('id, name, price, category_id, is_available')
    .eq('tenant_id', tenantId)
    .eq('is_available', true);

  if (itemsError || !items) return 0;

  const generated = generateSuggestions(items as MenuItem[]);
  if (generated.length === 0) return 0;

  // Clear existing suggestions before inserting new ones
  await supabase.from('item_suggestions').delete().eq('tenant_id', tenantId);

  const rows = generated.map((s, i) => ({
    tenant_id: tenantId,
    menu_item_id: s.menu_item_id,
    suggested_item_id: s.suggested_item_id,
    suggestion_type: s.suggestion_type,
    description: s.description,
    display_order: i,
    is_active: true,
  }));

  const { error } = await supabase.from('item_suggestions').insert(rows);
  if (error) throw error;

  return generated.length;
}
