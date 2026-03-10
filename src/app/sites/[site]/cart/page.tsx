'use client';

import { useCart } from '@/contexts/CartContext';
import { useTenant } from '@/contexts/TenantContext';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import {
  Plus,
  Minus,
  ArrowLeft,
  Utensils,
  Loader2,
  Trash2,
  ShoppingBag,
  Coffee,
  IceCreamCone,
  ChevronLeft,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import { useTranslations, useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from '@/components/tenant/BottomNav';

// ─── Types ───────────────────────────────────────────────────
interface UpsellItem {
  id: string;
  name: string;
  name_en?: string;
  price: number;
  prices?: Record<string, number> | null;
  image_url?: string;
  category_name?: string;
}

interface CartRecommendation {
  type: 'pairing' | 'drinks' | 'desserts' | 'featured' | 'complement';
  title: string;
  icon: 'pairing' | 'drinks' | 'desserts' | 'featured';
}

// ─── Helpers ─────────────────────────────────────────────────
const TIP_STEP = 500;

// formatPrice is now handled by useDisplayCurrency().formatDisplayPrice

const getTranslatedContent = (lang: string, fr: string, en?: string | null) => {
  return lang === 'en' && en ? en : fr;
};

const getCartItemKey = (item: {
  id: string;
  selectedOption?: { name_fr: string } | null;
  selectedVariant?: { name_fr: string } | null;
}): string => {
  let key = item.id;
  if (item.selectedOption) key += `-opt-${item.selectedOption.name_fr}`;
  if (item.selectedVariant) key += `-var-${item.selectedVariant.name_fr}`;
  return key;
};

// ─── Component ───────────────────────────────────────────────
export default function CartPage() {
  const {
    items,
    updateQuantity,
    removeFromCart,
    addToCart,
    clearCart,
    totalItems,
    notes,
    setNotes,
    currentRestaurantId,
    subtotal,
    taxAmount,
    serviceChargeAmount,
    discountAmount,
    grandTotal,
    enableTax,
    enableServiceCharge,
    taxRate,
    serviceChargeRate,
    currencyCode,
  } = useCart();
  const { slug: tenantSlug } = useTenant();
  const { formatDisplayPrice, resolveAndFormatPrice, displayCurrency } = useDisplayCurrency();
  const t = useTranslations('tenant');
  const locale = useLocale();
  const router = useRouter();
  const language = locale.startsWith('en') ? 'en' : 'fr';
  const menuPath = `/sites/${tenantSlug}/menu`;

  // States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [tipAmount, setTipAmount] = useState(0);

  // Upsell
  const [upsellItems, setUpsellItems] = useState<UpsellItem[]>([]);
  const [activeRecommendation, setActiveRecommendation] = useState<CartRecommendation | null>(null);
  const [isLoadingUpsell, setIsLoadingUpsell] = useState(false);

  // Image errors for upsell items
  const [upsellImageErrors, setUpsellImageErrors] = useState<Set<string>>(new Set());

  // ─── Stable cart fingerprint for suggestion refresh ────────
  const cartItemIds = useMemo(
    () =>
      items
        .map((i) => i.id)
        .sort()
        .join(','),
    [items],
  );

  // ─── Smart suggestions ────────────────────────────────────
  useEffect(() => {
    const fetchSmartSuggestions = async () => {
      if (!currentRestaurantId || items.length === 0) {
        setActiveRecommendation(null);
        setUpsellItems([]);
        return;
      }

      setIsLoadingUpsell(true);
      try {
        const supabase = createClient();
        const cartIds = new Set(items.map((i) => i.id));
        const collected: UpsellItem[] = [];

        // ── Strategy 1: Admin-configured pairings for items in cart ──
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

        // If we got enough from pairings, use those
        if (collected.length >= 3) {
          setActiveRecommendation({
            type: 'pairing',
            title: t('upsellPairings'),
            icon: 'pairing',
          });
          setUpsellItems(collected.slice(0, 6));
          setIsLoadingUpsell(false);
          return;
        }

        // ── Strategy 2: Contextual category complement ──────────
        // Find which categories are in the cart, suggest from others
        const cartCategoryIds = new Set(
          items.map((i) => i.category_id).filter(Boolean) as string[],
        );

        // Fetch all categories to understand the menu structure
        const { data: allCategories } = await supabase
          .from('categories')
          .select('id, name')
          .eq('tenant_id', currentRestaurantId);

        const categoryMap = new Map((allCategories || []).map((c) => [c.id, c.name.toLowerCase()]));

        // Detect what's missing based on actual DB categories
        const hasDrinkCategory = [...cartCategoryIds].some((id) => {
          const name = categoryMap.get(id) || '';
          return /boisson|drink|cocktail|wine|vin|bière|beer|jus|eau|soft|soda|café|coffee|thé|tea/.test(
            name,
          );
        });
        const hasDessertCategory = [...cartCategoryIds].some((id) => {
          const name = categoryMap.get(id) || '';
          return /dessert|douceur|sucré|sweet|glace|pâtisserie|fruit/.test(name);
        });

        // Find complement categories (not in cart)
        let complementCategoryIds: string[] = [];
        let recommendation: CartRecommendation | null = null;

        if (!hasDrinkCategory) {
          // Suggest drinks
          complementCategoryIds = (allCategories || [])
            .filter((c) =>
              /boisson|drink|cocktail|wine|vin|bière|beer|jus|eau|soft|soda|café|coffee|thé|tea/.test(
                c.name.toLowerCase(),
              ),
            )
            .map((c) => c.id);
          recommendation = {
            type: 'drinks',
            title: t('upsellDrinks'),
            icon: 'drinks',
          };
        } else if (!hasDessertCategory) {
          // Suggest desserts
          complementCategoryIds = (allCategories || [])
            .filter((c) =>
              /dessert|douceur|sucré|sweet|glace|pâtisserie|fruit/.test(c.name.toLowerCase()),
            )
            .map((c) => c.id);
          recommendation = {
            type: 'desserts',
            title: t('upsellDesserts'),
            icon: 'desserts',
          };
        }

        if (complementCategoryIds.length > 0 && recommendation) {
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
              // Merge with any pairings we already found
              const merged = [...collected, ...extras];
              const seen = new Set<string>();
              const deduped = merged.filter((item) => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
              });

              setActiveRecommendation(recommendation);
              setUpsellItems(deduped.slice(0, 6));
              setIsLoadingUpsell(false);
              return;
            }
          }
        }

        // ── Strategy 3: Featured items fallback ─────────────────
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
            const merged = [...collected, ...extras];
            const seen = new Set<string>();
            const deduped = merged.filter((item) => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });

            setActiveRecommendation({
              type: 'featured',
              title: t('upsellFeatured'),
              icon: 'featured',
            });
            setUpsellItems(deduped.slice(0, 6));
            setIsLoadingUpsell(false);
            return;
          }
        }

        // ── Strategy 4: Popular from other categories ───────────
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
                setActiveRecommendation({
                  type: 'complement',
                  title: t('upsellComplement'),
                  icon: 'pairing',
                });
                setUpsellItems(extras.slice(0, 6));
                setIsLoadingUpsell(false);
                return;
              }
            }
          }
        }

        // Nothing found — use pairings we collected (even if < 3)
        if (collected.length > 0) {
          setActiveRecommendation({
            type: 'pairing',
            title: t('upsellPairings'),
            icon: 'pairing',
          });
          setUpsellItems(collected);
        } else {
          setActiveRecommendation(null);
          setUpsellItems([]);
        }
      } catch (err) {
        logger.error('Error fetching suggestions:', err);
      } finally {
        setIsLoadingUpsell(false);
      }
    };

    fetchSmartSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRestaurantId, cartItemIds]);

  // ─── Handlers ──────────────────────────────────────────────
  const handleAddUpsellItem = useCallback(
    (item: UpsellItem) => {
      if (!currentRestaurantId) return;
      addToCart(
        {
          id: item.id,
          name: item.name,
          name_en: item.name_en,
          price: item.price,
          image_url: item.image_url,
          quantity: 1,
          category_name: item.category_name,
        },
        currentRestaurantId,
      );
    },
    [addToCart, currentRestaurantId],
  );

  const finalTotal = grandTotal + tipAmount;

  const handleSubmitOrder = async () => {
    setIsSubmitting(true);
    setError(null);
    setValidationErrors([]);

    try {
      const tableNumber = localStorage.getItem(`attabl_${tenantSlug}_table`) || undefined;

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug || '' },
        body: JSON.stringify({
          tableNumber,
          items: items.map((item) => ({
            id: item.id,
            name: item.name,
            name_en: item.name_en ?? undefined,
            price: item.price,
            quantity: item.quantity,
            category_name: item.category_name ?? undefined,
            selectedOption: item.selectedOption ?? undefined,
            selectedVariant: item.selectedVariant ?? undefined,
          })),
          notes: notes || undefined,
          display_currency: displayCurrency,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details && Array.isArray(data.details)) {
          setValidationErrors(data.details);
        }
        setError(data.error || t('orderError'));
        return;
      }

      // Store order ID for tracking
      const storedIds: string[] = JSON.parse(localStorage.getItem('attabl_order_ids') || '[]');
      if (data.orderId && !storedIds.includes(data.orderId)) {
        storedIds.push(data.orderId);
        localStorage.setItem('attabl_order_ids', JSON.stringify(storedIds));
      }

      clearCart();
      setTipAmount(0);
      router.push(`/sites/${tenantSlug}/order-confirmed?orderId=${data.orderId}`);
    } catch (err) {
      logger.error('Order submission error:', err);
      setError(t('connectionError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Empty cart ────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-neutral-50 pb-20">
        <div className="max-w-lg mx-auto px-4 pt-10 pb-2 relative flex items-center justify-center">
          <button
            onClick={() => router.back()}
            className="absolute left-4 p-2 text-neutral-400 hover:text-neutral-900 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-neutral-800 uppercase tracking-widest">
            {t('yourCart')}
          </h1>
        </div>

        <div className="flex flex-col items-center justify-center px-4 pt-20">
          <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mb-6">
            <ShoppingBag className="w-10 h-10 text-neutral-300" />
          </div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">{t('emptyCart')}</h2>
          <p className="text-sm text-neutral-500 text-center mb-8">{t('emptyCartDesc')}</p>
          <Link href={menuPath}>
            <button
              className="h-12 px-8 rounded-xl text-white font-semibold inline-flex items-center gap-2 transition-transform active:scale-[0.98]"
              style={{ backgroundColor: 'var(--tenant-primary)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              {t('browseMenu')}
            </button>
          </Link>
        </div>
        {tenantSlug && <BottomNav tenantSlug={tenantSlug} />}
      </main>
    );
  }

  // ─── Main cart ─────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-neutral-50 pb-44">
      {/* HEADER */}
      <div className="sticky top-0 z-40 bg-white border-b border-neutral-200">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-base font-bold text-neutral-900">{t('yourCart')}</h1>
            <p className="text-xs text-neutral-400">{t('itemCount', { count: totalItems })}</p>
          </div>
          <button
            onClick={() => {
              if (confirm(t('clearCartConfirm'))) clearCart();
            }}
            className="p-2 -mr-2 text-neutral-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Errors */}
        {(error || validationErrors.length > 0) && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                {error && <p className="font-medium text-red-800 text-sm">{error}</p>}
                {validationErrors.length > 0 && (
                  <ul className="mt-1 text-sm text-red-700 list-disc list-inside">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CART ITEMS */}
        <section className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="divide-y divide-neutral-100">
            <AnimatePresence mode="popLayout">
              {items.map((item) => {
                const itemKey = getCartItemKey(item);
                const optionLabel = item.selectedOption
                  ? language === 'en' && item.selectedOption.name_en
                    ? item.selectedOption.name_en
                    : item.selectedOption.name_fr
                  : null;
                const variantLabel = item.selectedVariant
                  ? language === 'en' && item.selectedVariant.name_en
                    ? item.selectedVariant.name_en
                    : item.selectedVariant.name_fr
                  : null;

                return (
                  <motion.div
                    key={itemKey}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    className="px-4 py-3 flex items-center gap-3"
                  >
                    {/* Quantity controls */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateQuantity(itemKey, item.quantity - 1)}
                        className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className="text-sm font-bold w-6 text-center"
                        style={{ color: 'var(--tenant-primary)' }}
                      >
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(itemKey, item.quantity + 1)}
                        className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Name & variant */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-neutral-900 leading-tight">
                        {getTranslatedContent(language, item.name, item.name_en)}
                      </h3>
                      {(optionLabel || variantLabel) && (
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {[variantLabel, optionLabel].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Price + delete */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-neutral-900 text-right whitespace-nowrap">
                        {resolveAndFormatPrice(
                          item.price * item.quantity,
                          item.prices,
                          currencyCode,
                        )}
                      </span>
                      <button
                        onClick={() => removeFromCart(itemKey)}
                        className="p-1 text-neutral-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Notes input */}
          <div className="px-4 py-3 border-t border-neutral-100">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('cartNotesPlaceholder')}
              className="w-full text-sm bg-transparent text-neutral-500 placeholder:text-neutral-400 focus:outline-none focus:text-neutral-700 transition-colors"
            />
          </div>
        </section>

        {/* UPSELL SUGGESTIONS */}
        <AnimatePresence>
          {(isLoadingUpsell || (activeRecommendation && upsellItems.length > 0)) && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white rounded-xl border border-neutral-200 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
                {activeRecommendation?.icon === 'drinks' ? (
                  <Coffee className="w-4 h-4" style={{ color: 'var(--tenant-primary)' }} />
                ) : activeRecommendation?.icon === 'desserts' ? (
                  <IceCreamCone className="w-4 h-4" style={{ color: 'var(--tenant-primary)' }} />
                ) : (
                  <Utensils className="w-4 h-4" style={{ color: 'var(--tenant-primary)' }} />
                )}
                <h2 className="text-sm font-bold text-neutral-900">
                  {isLoadingUpsell ? (
                    <div className="h-4 w-32 bg-neutral-200 rounded animate-pulse" />
                  ) : (
                    activeRecommendation?.title
                  )}
                </h2>
              </div>

              <div className="p-3 overflow-x-auto scrollbar-hide">
                <div className="flex gap-3 min-w-max px-1">
                  {isLoadingUpsell
                    ? [1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="w-[130px] flex-shrink-0 bg-neutral-50 rounded-xl p-2.5 border border-neutral-100 animate-pulse"
                        >
                          <div className="w-full h-20 bg-neutral-100 rounded-lg mb-2" />
                          <div className="h-3 w-3/4 bg-neutral-100 rounded mb-1" />
                          <div className="h-3 w-1/2 bg-neutral-100 rounded" />
                        </div>
                      ))
                    : upsellItems.map((item) => {
                        const hasImage =
                          item.image_url &&
                          !item.image_url.includes('placeholder') &&
                          !upsellImageErrors.has(item.id);

                        return (
                          <div
                            key={item.id}
                            className="w-[130px] flex-shrink-0 bg-white rounded-xl p-2.5 border border-neutral-100 shadow-sm"
                          >
                            <div className="w-full h-20 rounded-lg mb-2.5 overflow-hidden relative bg-neutral-50 flex items-center justify-center">
                              {hasImage ? (
                                <Image
                                  src={item.image_url!}
                                  alt={item.name}
                                  fill
                                  sizes="130px"
                                  className="object-cover"
                                  onError={() =>
                                    setUpsellImageErrors((prev) => new Set(prev).add(item.id))
                                  }
                                />
                              ) : (
                                <Utensils className="w-5 h-5 text-neutral-300" />
                              )}
                              <div className="absolute top-1 right-1 z-10">
                                <button
                                  onClick={() => handleAddUpsellItem(item)}
                                  className="w-7 h-7 rounded-full bg-white/90 shadow-md flex items-center justify-center active:scale-90 transition-all"
                                  style={{ color: 'var(--tenant-primary)' }}
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <h3 className="text-[11px] font-bold text-neutral-800 line-clamp-2 leading-tight mb-2 h-7">
                              {getTranslatedContent(language, item.name, item.name_en)}
                            </h3>
                            <span
                              className="text-xs font-black"
                              style={{ color: 'var(--tenant-primary)' }}
                            >
                              {resolveAndFormatPrice(item.price, item.prices, currencyCode)}
                            </span>
                          </div>
                        );
                      })}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ORDER SUMMARY */}
        <section className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 space-y-3">
            {/* Subtotal */}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">{t('subtotal')}</span>
              <span className="text-neutral-900 font-medium">
                {formatDisplayPrice(subtotal, currencyCode)}
              </span>
            </div>

            {/* Tax */}
            {enableTax && taxAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">
                  {t('tax')} ({taxRate}%)
                </span>
                <span className="text-neutral-900 font-medium">
                  {formatDisplayPrice(taxAmount, currencyCode)}
                </span>
              </div>
            )}

            {/* Service charge */}
            {enableServiceCharge && serviceChargeAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">
                  {t('serviceCharge')} ({serviceChargeRate}%)
                </span>
                <span className="text-neutral-900 font-medium">
                  {formatDisplayPrice(serviceChargeAmount, currencyCode)}
                </span>
              </div>
            )}

            {/* Discount */}
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>{t('discount')}</span>
                <span>-{formatDisplayPrice(discountAmount, currencyCode)}</span>
              </div>
            )}

            {/* Tip */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">{t('tip')}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setTipAmount((prev) =>
                      prev === TIP_STEP * 2 ? 0 : Math.max(0, prev - TIP_STEP),
                    )
                  }
                  disabled={tipAmount === 0}
                  className={cn(
                    'w-7 h-7 rounded-full border flex items-center justify-center transition-all',
                    tipAmount === 0
                      ? 'border-neutral-200 text-neutral-300 cursor-not-allowed'
                      : 'border-neutral-300 text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50 active:scale-95',
                  )}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm font-bold text-neutral-900 min-w-[60px] text-center">
                  {formatDisplayPrice(tipAmount, currencyCode)}
                </span>
                <button
                  onClick={() =>
                    setTipAmount((prev) => (prev === 0 ? TIP_STEP * 2 : prev + TIP_STEP))
                  }
                  className="w-7 h-7 rounded-full border flex items-center justify-center transition-all active:scale-95"
                  style={{
                    borderColor: 'var(--tenant-primary)',
                    color: 'var(--tenant-primary)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Total */}
            <div className="border-t border-neutral-200 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-neutral-900">{t('total')}</span>
                <span className="text-xl font-black text-neutral-900">
                  {formatDisplayPrice(finalTotal, currencyCode)}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* STICKY CTA — above bottom nav */}
      <div
        className="fixed left-0 right-0 z-[60] bg-white border-t border-neutral-200 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
        style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSubmitOrder}
            disabled={isSubmitting}
            className="w-full h-14 rounded-xl text-white font-bold text-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            style={{ backgroundColor: 'var(--tenant-primary)' }}
          >
            {isSubmitting ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <span>{t('confirmOrder')}</span>
            )}
          </button>
        </div>
      </div>
      {tenantSlug && <BottomNav tenantSlug={tenantSlug} />}
    </main>
  );
}
