'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import {
  getSmartSuggestions,
  type CartItemInput,
  type MenuItemCandidate,
  type CategoryInput,
  type SuggestionReason,
} from '@/lib/recommendations/smart-suggestions';

export type { SuggestionReason };

export interface UpsellItem {
  id: string;
  name: string;
  name_en?: string;
  price: number;
  prices?: Record<string, number> | null;
  image_url?: string;
  category_id?: string | null;
  category_name?: string;
  reason: SuggestionReason;
}

export interface CartItemForSuggestions {
  id: string;
  category_id?: string | null;
  price: number;
  is_vegetarian?: boolean | null;
  is_spicy?: boolean | null;
}

/**
 * Smart menu-based upsell suggestions for the cart.
 *
 * Two modes:
 *
 * 1. In-memory (fast, no DB calls) — pass allMenuItems + allCategories.
 *    Used on pages that already have the full menu loaded (menu page, detail sheet).
 *    isLoadingUpsell is always false in this mode.
 *
 * 2. Fetch mode — pass only cartItems + restaurantId.
 *    Used on the cart page which doesn't have menu data yet.
 *    Fetches menu_items + categories once, then runs the same algorithm in memory.
 *    Shows isLoadingUpsell = true while fetching.
 */
export function useCartSuggestions(
  cartItems: CartItemForSuggestions[],
  restaurantId: string | null | undefined,
  allMenuItems?: MenuItemCandidate[],
  allCategories?: CategoryInput[],
  maxResults = 6,
): { upsellItems: UpsellItem[]; isLoadingUpsell: boolean } {
  // --- In-memory mode: menu data provided by caller ---
  const inMemoryItems = useMemo<UpsellItem[] | null>(() => {
    if (!allMenuItems || !allCategories) return null;
    if (cartItems.length === 0) return [];

    return getSmartSuggestions(
      cartItems as CartItemInput[],
      allMenuItems,
      allCategories,
      maxResults,
    ).map(({ item, reason }) => ({
      id: item.id,
      name: item.name,
      name_en: item.name_en ?? undefined,
      price: item.price,
      prices: item.prices,
      image_url: item.image_url ?? undefined,
      category_id: item.category_id,
      reason,
    }));
  }, [allMenuItems, allCategories, cartItems, maxResults]);

  // --- Fetch mode: load menu from DB, run algorithm ---
  const [fetchedItems, setFetchedItems] = useState<UpsellItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchIdRef = useRef(0);

  const cartFingerprint = useMemo(
    () =>
      cartItems
        .map((i) => i.id)
        .sort()
        .join(','),
    [cartItems],
  );

  useEffect(() => {
    // Skip if in-memory mode is active
    if (allMenuItems && allCategories) return;
    if (!restaurantId || cartItems.length === 0) {
      setFetchedItems([]);
      return;
    }

    fetchIdRef.current += 1;
    const thisFetchId = fetchIdRef.current;

    const run = async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();

        const [{ data: menuData }, { data: catData }] = await Promise.all([
          supabase
            .from('menu_items')
            .select(
              'id, name, name_en, price, prices, image_url, category_id, is_available, is_featured, is_vegetarian, is_spicy, rating, rating_count',
            )
            .eq('tenant_id', restaurantId)
            .eq('is_available', true),
          supabase.from('categories').select('id, name').eq('tenant_id', restaurantId),
        ]);

        if (thisFetchId !== fetchIdRef.current) return;

        const menu = (menuData ?? []) as MenuItemCandidate[];
        const cats = (catData ?? []) as CategoryInput[];

        const suggestions = getSmartSuggestions(
          cartItems as CartItemInput[],
          menu,
          cats,
          maxResults,
        );

        if (thisFetchId !== fetchIdRef.current) return;

        const catMap = new Map(cats.map((c) => [c.id, c.name]));

        setFetchedItems(
          suggestions.map(({ item, reason }) => ({
            id: item.id,
            name: item.name,
            name_en: item.name_en ?? undefined,
            price: item.price,
            prices: item.prices,
            image_url: item.image_url ?? undefined,
            category_id: item.category_id,
            category_name: item.category_id ? catMap.get(item.category_id) : undefined,
            reason,
          })),
        );
      } catch (err) {
        logger.error('useCartSuggestions fetch error', err);
      } finally {
        if (thisFetchId === fetchIdRef.current) setIsLoading(false);
      }
    };

    const timer = setTimeout(run, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, cartFingerprint]);

  if (inMemoryItems !== null) {
    return { upsellItems: inMemoryItems, isLoadingUpsell: false };
  }

  return { upsellItems: fetchedItems, isLoadingUpsell: isLoading };
}
