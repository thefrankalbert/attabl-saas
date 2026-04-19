'use client';

import { useTranslations } from 'next-intl';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Search, Utensils, SearchX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils/currency';
import type { MenuItem, Category, CurrencyCode } from '@/types/admin.types';
import type { CartItem } from '@/hooks/usePOSData';
import POSItemCustomizer from './POSItemCustomizer';

interface POSProductBrowserProps {
  items: MenuItem[];
  categories: Category[];
  cart: CartItem[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  onAddToCart: (
    item: MenuItem,
    modifiers?: Array<{ name: string; price: number }>,
    variant?: { name: string; price: number },
  ) => void;
  currency: CurrencyCode;
}

const SCROLL_ANIMATION_MS = 800;

export default function POSProductBrowser({
  items,
  categories,
  cart,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  onAddToCart,
  currency,
}: POSProductBrowserProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');

  // Pre-computed cart quantity map for O(1) lookups in the render loop
  const cartQuantityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cart) {
      map.set(c.id, (map.get(c.id) || 0) + c.quantity);
    }
    return map;
  }, [cart]);

  // ─── Item customizer state ─────────────────────────────
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);

  const handleItemClick = useCallback(
    (item: MenuItem) => {
      const hasVariants = item.price_variants && item.price_variants.length > 0;
      const hasModifiers = item.modifiers && item.modifiers.length > 0;
      if (hasVariants || hasModifiers) {
        setCustomizingItem(item);
      } else {
        onAddToCart(item);
      }
    },
    [onAddToCart],
  );

  const handleCustomizerAdd = useCallback(
    (
      item: MenuItem,
      modifiers: Array<{ name: string; price: number }>,
      variant?: { name: string; price: number },
    ) => {
      onAddToCart(item, modifiers.length > 0 ? modifiers : undefined, variant);
      setCustomizingItem(null);
    },
    [onAddToCart],
  );

  // Refs for scroll synchronization
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const pillRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pillBarRef = useRef<HTMLDivElement>(null);
  const isScrollingFromClick = useRef(false);

  // Extract translated label outside memo to avoid unstable tc reference in deps
  const otherLabel = tc('other');

  // Group items by category, preserving category order
  const groupedItems = useMemo(() => {
    const groups: Array<{ category: Category; items: MenuItem[] }> = [];
    const categoryIds = new Set(categories.map((c) => c.id));
    const uncategorized: MenuItem[] = [];

    for (const cat of categories) {
      const catItems = items.filter((item) => item.category_id === cat.id);
      if (catItems.length > 0) {
        groups.push({ category: cat, items: catItems });
      }
    }

    // Items without a matching category
    for (const item of items) {
      if (!categoryIds.has(item.category_id)) {
        uncategorized.push(item);
      }
    }

    if (uncategorized.length > 0) {
      groups.push({
        category: { id: '__uncategorized', name: otherLabel, display_order: 9999 } as Category,
        items: uncategorized,
      });
    }

    return groups;
  }, [items, categories, otherLabel]);

  // Categories that actually have items (for the pill bar)
  const activeCategories = useMemo(() => groupedItems.map((g) => g.category), [groupedItems]);

  // Set up IntersectionObserver to detect which category section is visible
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Skip observer updates during programmatic scrolling
        if (isScrollingFromClick.current) return;

        // Find the topmost visible section
        let topEntry: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!topEntry || entry.boundingClientRect.top < topEntry.boundingClientRect.top) {
              topEntry = entry;
            }
          }
        }

        if (topEntry) {
          const categoryId = topEntry.target.getAttribute('data-category-id');
          if (categoryId) {
            setSelectedCategory(categoryId);
          }
        }
      },
      {
        root: container,
        // Trigger when a section enters the top 30% of the viewport
        rootMargin: '0px 0px -70% 0px',
        threshold: 0,
      },
    );

    // Observe all section elements
    const sections = sectionRefs.current;
    sections.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [groupedItems, setSelectedCategory]);

  // Auto-scroll the active pill into view in the horizontal bar
  useEffect(() => {
    const pill = pillRefs.current.get(selectedCategory);
    if (pill && pillBarRef.current) {
      pill.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [selectedCategory]);

  // Handle category pill click - scroll to section
  const handleCategoryClick = useCallback(
    (categoryId: string) => {
      setSelectedCategory(categoryId);

      if (categoryId === 'all') {
        // Scroll to top
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const section = sectionRefs.current.get(categoryId);
      if (section && scrollContainerRef.current) {
        isScrollingFromClick.current = true;
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Re-enable observer after scroll animation completes
        setTimeout(() => {
          isScrollingFromClick.current = false;
        }, SCROLL_ANIMATION_MS);
      }
    },
    [setSelectedCategory],
  );

  // Ref callback to register section elements
  const setSectionRef = useCallback((categoryId: string, el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(categoryId, el);
    } else {
      sectionRefs.current.delete(categoryId);
    }
  }, []);

  // Ref callback to register pill elements
  const setPillRef = useCallback((categoryId: string, el: HTMLButtonElement | null) => {
    if (el) {
      pillRefs.current.set(categoryId, el);
    } else {
      pillRefs.current.delete(categoryId);
    }
  }, []);

  const hasItems = groupedItems.length > 0;

  return (
    <>
      {/* Header Filters */}
      <div className="p-3 sm:p-4 border-b border-app-border space-y-3 sm:space-y-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
          <Input
            data-search-input
            placeholder={t('searchProduct')}
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div ref={pillBarRef} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <Button
            ref={(el) => setPillRef('all', el)}
            variant={selectedCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleCategoryClick('all')}
            className="rounded-full min-h-[44px]"
          >
            {tc('all')}
          </Button>
          {activeCategories.map((cat) => (
            <Button
              key={cat.id}
              ref={(el) => setPillRef(cat.id, el)}
              variant={selectedCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleCategoryClick(cat.id)}
              className="rounded-full whitespace-nowrap min-h-[44px]"
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Grid - grouped by category with sticky section headers */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar">
        {hasItems ? (
          <div className="px-3 sm:px-4 pb-3 sm:pb-4">
            {groupedItems.map(({ category: cat, items: catItems }) => (
              <section
                key={cat.id}
                ref={(el) => setSectionRef(cat.id, el)}
                data-category-id={cat.id}
              >
                <div className="sticky top-0 z-20 bg-app-bg pt-3 pb-2">
                  <h2 className="text-xs font-bold text-app-text-muted uppercase tracking-wider">
                    {cat.name}
                  </h2>
                </div>
                <div className="grid grid-cols-1 @sm:grid-cols-2 @md:grid-cols-2 @lg:grid-cols-3 @xl:grid-cols-3 @2xl:grid-cols-4 gap-2 pb-4">
                  {catItems.map((item) => (
                    <Button
                      key={item.id}
                      variant="outline"
                      onClick={() => handleItemClick(item)}
                      className="text-left group bg-app-elevated hover:bg-app-hover hover:border-accent/30 rounded-xl p-2 active:scale-95 flex items-center gap-2.5 relative z-0 h-auto whitespace-normal"
                    >
                      <div className="h-14 w-14 shrink-0 bg-app-card rounded-lg flex items-center justify-center relative overflow-hidden">
                        {item.image_url ? (
                          <Image src={item.image_url} alt="" fill className="object-cover" />
                        ) : (
                          <Utensils className="w-5 h-5 text-app-text-muted/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-xs text-app-text leading-tight">
                          {item.name}
                        </h3>
                        <p className="text-[11px] font-bold text-app-text-secondary mt-0.5">
                          {item.price_variants && item.price_variants.length > 0
                            ? `${formatCurrency(
                                Math.min(item.price, ...item.price_variants.map((v) => v.price)),
                                currency,
                              )}+`
                            : formatCurrency(item.price, currency)}
                        </p>
                      </div>
                      {cartQuantityMap.has(item.id) && (
                        <div className="absolute -top-1 -right-1 bg-accent text-accent-text w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">
                          {cartQuantityMap.get(item.id) || 0}
                        </div>
                      )}
                    </Button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-app-text-muted">
            <SearchX className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">{t('noResults')}</p>
          </div>
        )}
      </div>

      {/* Item Customizer Modal */}
      {customizingItem && (
        <POSItemCustomizer
          item={customizingItem}
          currency={currency}
          onAdd={handleCustomizerAdd}
          onClose={() => setCustomizingItem(null)}
        />
      )}
    </>
  );
}
