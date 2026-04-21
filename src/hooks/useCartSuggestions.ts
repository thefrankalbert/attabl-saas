'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';

export interface UpsellItem {
  id: string;
  name: string;
  name_en?: string;
  price: number;
  prices?: Record<string, number> | null;
  image_url?: string;
  category_name?: string;
}

interface CartItemForSuggestions {
  id: string;
  category_id?: string | null;
}

/**
 * Returns personalized upsell suggestions for the current cart.
 *
 * Strategy cascade (first one with >= 3 hits wins, rest become fallback
 * filler for the carousel):
 * 1. Co-occurrence from past orders (RPC get_co_ordered_items)
 * 2. Admin-configured pairings (table item_suggestions)
 * 3. Contextual category complement (missing drinks / missing dessert)
 * 4. Featured items
 * 5. Popular items from categories not in cart
 *
 * Debounced 300ms after cart changes; cancels in-flight previous fetches.
 */
export function useCartSuggestions(
  items: CartItemForSuggestions[],
  currentRestaurantId: string | null | undefined,
): { upsellItems: UpsellItem[]; isLoadingUpsell: boolean } {
  const [upsellItems, setUpsellItems] = useState<UpsellItem[]>([]);
  const [isLoadingUpsell, setIsLoadingUpsell] = useState(false);
  const fetchIdRef = useRef(0);

  // Stable fingerprint so effect doesn't rerun on unrelated item field changes
  const cartItemIds = useMemo(
    () =>
      items
        .map((i) => i.id)
        .sort()
        .join(','),
    [items],
  );

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchIdRef.current += 1;
      const thisFetchId = fetchIdRef.current;

      const fetchSmartSuggestions = async () => {
        if (!currentRestaurantId || items.length === 0) {
          setUpsellItems([]);
          return;
        }

        setIsLoadingUpsell(true);
        try {
          const supabase = createClient();
          const cartIds = new Set(items.map((i) => i.id));
          const cartIdsArray = Array.from(cartIds);
          const collected: UpsellItem[] = [];

          // Strategy 0 (highest priority): Co-occurrence from past orders.
          const { data: coOrdered } = await supabase.rpc('get_co_ordered_items', {
            p_tenant_id: currentRestaurantId,
            p_cart_ids: cartIdsArray,
            p_limit: 6,
          });

          if (coOrdered && Array.isArray(coOrdered) && coOrdered.length >= 3) {
            const coIds = (coOrdered as { menu_item_id: string }[]).map((r) => r.menu_item_id);
            const { data: coItems } = await supabase
              .from('menu_items')
              .select('id, name, name_en, price, image_url, is_available, category_id')
              .in('id', coIds)
              .eq('tenant_id', currentRestaurantId)
              .eq('is_available', true);

            if (coItems && coItems.length >= 3) {
              const orderMap = new Map(coIds.map((id, i) => [id, i]));
              const sorted = [...coItems].sort(
                (a, b) => (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99),
              );

              if (thisFetchId !== fetchIdRef.current) return;
              setUpsellItems(
                sorted.slice(0, 6).map((mi) => ({
                  id: mi.id,
                  name: mi.name,
                  name_en: mi.name_en ?? undefined,
                  price: mi.price,
                  image_url: mi.image_url ?? undefined,
                })),
              );
              setIsLoadingUpsell(false);
              return;
            }
          }

          // Strategy 1: Admin-configured pairings
          const { data: pairings } = await supabase
            .from('item_suggestions')
            .select(
              'suggestion_type, suggested_item:menu_items!item_suggestions_suggested_item_id_fkey(id, name, name_en, price, image_url, is_available, category_id)',
            )
            .eq('tenant_id', currentRestaurantId)
            .in('menu_item_id', Array.from(cartIds))
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .limit(8);

          if (pairings && pairings.length > 0) {
            const seen = new Set<string>();
            for (const p of pairings) {
              const si = p.suggested_item as unknown as Record<string, unknown> | null;
              if (!si || si.is_available === false) continue;
              const id = si.id as string;
              if (cartIds.has(id) || seen.has(id)) continue;
              seen.add(id);
              collected.push({
                id,
                name: si.name as string,
                name_en: (si.name_en as string) || undefined,
                price: si.price as number,
                image_url: (si.image_url as string) || undefined,
              });
            }
          }

          if (collected.length >= 3) {
            if (thisFetchId !== fetchIdRef.current) return;
            setUpsellItems(collected.slice(0, 6));
            setIsLoadingUpsell(false);
            return;
          }

          // Strategy 2: Contextual category complement
          const cartCategoryIds = new Set(
            items.map((i) => i.category_id).filter(Boolean) as string[],
          );

          const { data: allCategories } = await supabase
            .from('categories')
            .select('id, name')
            .eq('tenant_id', currentRestaurantId);

          const categoryMap = new Map(
            (allCategories || []).map((c) => [c.id, c.name.toLowerCase()]),
          );

          const hasDrinkCategory = [...cartCategoryIds].some((id) => {
            const name = categoryMap.get(id) || '';
            return /boisson|drink|cocktail|wine|vin|bi[eè]re|beer|jus|eau|soft|soda|caf[eé]|coffee|th[eé]|tea/.test(
              name,
            );
          });
          const hasDessertCategory = [...cartCategoryIds].some((id) => {
            const name = categoryMap.get(id) || '';
            return /dessert|douceur|sucr[eé]|sweet|glace|p[aâ]tisserie|fruit/.test(name);
          });

          let complementCategoryIds: string[] = [];

          if (!hasDrinkCategory) {
            complementCategoryIds = (allCategories || [])
              .filter((c) =>
                /boisson|drink|cocktail|wine|vin|bi[eè]re|beer|jus|eau|soft|soda|caf[eé]|coffee|th[eé]|tea/.test(
                  c.name.toLowerCase(),
                ),
              )
              .map((c) => c.id);
          } else if (!hasDessertCategory) {
            complementCategoryIds = (allCategories || [])
              .filter((c) =>
                /dessert|douceur|sucr[eé]|sweet|glace|p[aâ]tisserie|fruit/.test(
                  c.name.toLowerCase(),
                ),
              )
              .map((c) => c.id);
          }

          if (complementCategoryIds.length > 0) {
            const { data: complementItems } = await supabase
              .from('menu_items')
              .select('id, name, name_en, price, image_url, category_id, is_featured')
              .in('category_id', complementCategoryIds)
              .eq('is_available', true)
              .eq('tenant_id', currentRestaurantId)
              .order('is_featured', { ascending: false })
              .order('display_order', { ascending: true })
              .limit(8);

            if (complementItems && complementItems.length > 0) {
              const extras = complementItems
                .filter((mi) => !cartIds.has(mi.id))
                .map((mi) => ({
                  id: mi.id,
                  name: mi.name,
                  name_en: mi.name_en ?? undefined,
                  price: mi.price,
                  image_url: mi.image_url ?? undefined,
                  category_name: (allCategories || []).find((c) => c.id === mi.category_id)?.name,
                }));

              if (extras.length > 0) {
                if (thisFetchId !== fetchIdRef.current) return;
                const merged = [...collected, ...extras];
                const seen = new Set<string>();
                const deduped = merged.filter((item) => {
                  if (seen.has(item.id)) return false;
                  seen.add(item.id);
                  return true;
                });

                setUpsellItems(deduped.slice(0, 6));
                setIsLoadingUpsell(false);
                return;
              }
            }
          }

          // Strategy 3: Featured items fallback
          const { data: featured } = await supabase
            .from('menu_items')
            .select('id, name, name_en, price, image_url, category_id')
            .eq('tenant_id', currentRestaurantId)
            .eq('is_available', true)
            .eq('is_featured', true)
            .limit(8);

          if (featured && featured.length > 0) {
            const extras = featured
              .filter((mi) => !cartIds.has(mi.id))
              .map((mi) => ({
                id: mi.id,
                name: mi.name,
                name_en: mi.name_en ?? undefined,
                price: mi.price,
                image_url: mi.image_url ?? undefined,
                category_name: (allCategories || []).find((c) => c.id === mi.category_id)?.name,
              }));

            if (extras.length > 0) {
              if (thisFetchId !== fetchIdRef.current) return;
              const merged = [...collected, ...extras];
              const seen = new Set<string>();
              const deduped = merged.filter((item) => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
              });

              setUpsellItems(deduped.slice(0, 6));
              setIsLoadingUpsell(false);
              return;
            }
          }

          // Strategy 4: Popular from other categories
          if (cartCategoryIds.size > 0) {
            const otherCatIds = (allCategories || [])
              .filter((c) => !cartCategoryIds.has(c.id))
              .map((c) => c.id);

            if (otherCatIds.length > 0) {
              const { data: otherItems } = await supabase
                .from('menu_items')
                .select('id, name, name_en, price, image_url, category_id')
                .in('category_id', otherCatIds)
                .eq('is_available', true)
                .eq('tenant_id', currentRestaurantId)
                .order('display_order', { ascending: true })
                .limit(6);

              if (otherItems && otherItems.length > 0) {
                const extras = otherItems
                  .filter((mi) => !cartIds.has(mi.id))
                  .map((mi) => ({
                    id: mi.id,
                    name: mi.name,
                    name_en: mi.name_en ?? undefined,
                    price: mi.price,
                    image_url: mi.image_url ?? undefined,
                    category_name: (allCategories || []).find((c) => c.id === mi.category_id)?.name,
                  }));

                if (extras.length > 0) {
                  if (thisFetchId !== fetchIdRef.current) return;
                  setUpsellItems(extras.slice(0, 6));
                  setIsLoadingUpsell(false);
                  return;
                }
              }
            }
          }

          if (thisFetchId !== fetchIdRef.current) return;
          if (collected.length > 0) {
            setUpsellItems(collected);
          } else {
            setUpsellItems([]);
          }
        } catch (err) {
          logger.error('Error fetching suggestions:', err);
        } finally {
          if (thisFetchId === fetchIdRef.current) {
            setIsLoadingUpsell(false);
          }
        }
      };

      fetchSmartSuggestions();
    }, 300);

    return () => clearTimeout(debounceTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRestaurantId, cartItemIds]);

  return { upsellItems, isLoadingUpsell };
}
