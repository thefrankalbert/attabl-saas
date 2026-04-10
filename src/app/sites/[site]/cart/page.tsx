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
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Check,
  X,
  Tag,
  HandCoins,
  ChefHat,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import { useTranslations, useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from '@/components/tenant/BottomNav';

// --- Types ---------------------------------------------------
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

type TipPreset = 0 | 500 | 1000 | 1500 | 2000 | 'custom';

// --- Helpers -------------------------------------------------
const NOTES_MAX_LENGTH = 200;

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

// --- Component -----------------------------------------------
export default function CartPage() {
  const {
    items,
    updateQuantity,
    removeFromCart,
    addToCart,
    clearCart,
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
    appliedCoupon,
    applyCoupon,
    removeCoupon,
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

  // Tip state: preset (absolute amount) or custom
  const [tipPreset, setTipPreset] = useState<TipPreset>(0);
  const [customTipInput, setCustomTipInput] = useState<string>('');
  const [tipOpen, setTipOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // Promo code state
  const [promoInput, setPromoInput] = useState<string>('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoJustApplied, setPromoJustApplied] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);

  // Upsell
  const [upsellItems, setUpsellItems] = useState<UpsellItem[]>([]);
  const [isLoadingUpsell, setIsLoadingUpsell] = useState(false);
  const [upsellImageErrors, setUpsellImageErrors] = useState<Set<string>>(new Set());
  // Title is now fixed ("Vous aimerez aussi") regardless of which strategy returned
  // items, so the strategies no longer need to track which recommendation type is
  // active. This shim preserves the in-effect call sites without dead-state warnings.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setActiveRecommendation = useCallback((_rec: CartRecommendation | null) => {}, []);

  // --- Tip computation (absolute amounts, not percentages) --
  const tipAmount = useMemo(() => {
    if (tipPreset === 0) return 0;
    if (tipPreset === 'custom') {
      const parsed = parseFloat(customTipInput.replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    return tipPreset;
  }, [tipPreset, customTipInput]);

  // --- Stable cart fingerprint for suggestion refresh --------
  const cartItemIds = useMemo(
    () =>
      items
        .map((i) => i.id)
        .sort()
        .join(','),
    [items],
  );

  const fetchIdRef = useRef(0);

  // --- Smart suggestions -------------------------------------
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchIdRef.current += 1;
      const thisFetchId = fetchIdRef.current;

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
          const cartIdsArray = Array.from(cartIds);
          const collected: UpsellItem[] = [];

          // Strategy 0 (highest priority): Co-occurrence from past orders.
          // "People who ordered X also ordered Y" — uses the tenant's own order
          // history via the get_co_ordered_items RPC. No external service.
          const { data: coOrdered } = await supabase.rpc('get_co_ordered_items', {
            p_tenant_id: currentRestaurantId,
            p_cart_ids: cartIdsArray,
            p_limit: 6,
          });

          if (coOrdered && Array.isArray(coOrdered) && coOrdered.length >= 3) {
            // Hydrate the menu_item rows for the suggestions returned by the RPC
            const coIds = (coOrdered as { menu_item_id: string }[]).map((r) => r.menu_item_id);
            const { data: coItems } = await supabase
              .from('menu_items')
              .select('id, name, name_en, price, image_url, is_available, category_id')
              .in('id', coIds)
              .eq('tenant_id', currentRestaurantId)
              .eq('is_available', true);

            if (coItems && coItems.length >= 3) {
              // Preserve the frequency-sorted order from the RPC
              const orderMap = new Map(coIds.map((id, i) => [id, i]));
              const sorted = [...coItems].sort(
                (a, b) => (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99),
              );

              if (thisFetchId !== fetchIdRef.current) return;
              setActiveRecommendation({
                type: 'pairing',
                title: t('upsellPairings'),
                icon: 'pairing',
              });
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
            setActiveRecommendation({
              type: 'pairing',
              title: t('upsellPairings'),
              icon: 'pairing',
            });
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
          let recommendation: CartRecommendation | null = null;

          if (!hasDrinkCategory) {
            complementCategoryIds = (allCategories || [])
              .filter((c) =>
                /boisson|drink|cocktail|wine|vin|bi[eè]re|beer|jus|eau|soft|soda|caf[eé]|coffee|th[eé]|tea/.test(
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
            complementCategoryIds = (allCategories || [])
              .filter((c) =>
                /dessert|douceur|sucr[eé]|sweet|glace|p[aâ]tisserie|fruit/.test(
                  c.name.toLowerCase(),
                ),
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
                if (thisFetchId !== fetchIdRef.current) return;
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

          if (thisFetchId !== fetchIdRef.current) return;
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

  // --- Handlers ----------------------------------------------
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

  const handleApplyPromo = useCallback(async () => {
    const code = promoInput.trim();
    if (!code) return;
    setPromoApplying(true);
    setPromoError(null);
    try {
      const result = await applyCoupon(code);
      if (result.success) {
        setPromoJustApplied(true);
        setPromoInput('');
        setTimeout(() => setPromoJustApplied(false), 2500);
      } else {
        setPromoError(result.error || t('orderError'));
      }
    } catch (err) {
      logger.error('Promo apply error:', err);
      setPromoError(t('connectionError'));
    } finally {
      setPromoApplying(false);
    }
  }, [promoInput, applyCoupon, t]);

  const handleRemovePromo = useCallback(() => {
    removeCoupon();
    setPromoError(null);
    setPromoJustApplied(false);
  }, [removeCoupon]);

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
            // Forward modifiers + per-item notes so ItemDetailSheet selections actually
            // persist on the order (server re-validates modifier prices anti-fraud).
            modifiers: item.modifiers && item.modifiers.length > 0 ? item.modifiers : undefined,
            customerNotes: item.customerNotes || undefined,
          })),
          notes: notes || undefined,
          display_currency: displayCurrency,
          tip_amount: tipAmount > 0 ? tipAmount : undefined,
          // Forward applied coupon code so the server re-validates and applies the
          // discount to the persisted order (otherwise the discount is purely cosmetic).
          coupon_code: appliedCoupon?.code,
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

      const storedIds: string[] = JSON.parse(localStorage.getItem('attabl_order_ids') || '[]');
      if (data.orderId && !storedIds.includes(data.orderId)) {
        storedIds.push(data.orderId);
        localStorage.setItem('attabl_order_ids', JSON.stringify(storedIds));
      }

      clearCart();
      setTipPreset(0);
      setCustomTipInput('');
      router.push(`/sites/${tenantSlug}/order-confirmed?orderId=${data.orderId}`);
    } catch (err) {
      logger.error('Order submission error:', err);
      setError(t('connectionError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Empty cart state --------------------------------------
  if (items.length === 0) {
    return (
      <main className="h-full bg-white pb-20">
        <div className="max-w-lg mx-auto h-14 px-4 flex items-center">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#B0B0B0] hover:text-[#1A1A1A] transition-colors"
            aria-label={t('ariaGoBack')}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center px-4 pt-20">
          <div className="w-32 h-32 bg-[#F6F6F6] rounded-full flex items-center justify-center mb-6">
            <ShoppingBag className="w-16 h-16 text-[#B0B0B0]" strokeWidth={1.5} />
          </div>
          <h2 className="text-[20px] font-bold text-[#1A1A1A] mb-2 text-center">
            {t('emptyCart')}
          </h2>
          <p className="text-[13px] text-[#737373] text-center mb-8 max-w-[280px]">
            {t('emptyCartDesc')}
          </p>
          <Link href={menuPath}>
            <button className="h-[52px] px-8 rounded-xl bg-[#1A1A1A] text-white text-[15px] font-semibold inline-flex items-center gap-2 transition-transform active:scale-[0.98] hover:bg-black">
              <ArrowLeft className="w-4 h-4" />
              {t('browseMenu')}
            </button>
          </Link>
        </div>
        {tenantSlug && <BottomNav tenantSlug={tenantSlug} />}
      </main>
    );
  }

  // --- Main cart ---------------------------------------------
  const notesLength = notes?.length ?? 0;

  return (
    <main
      className="min-h-full bg-white"
      style={{
        // Stop scroll just after the CTA clears the order summary. CTA top edge is
        // at 128px from viewport bottom (76 bottom-anchor + 52 button height) so 144
        // gives ~16px breathing — content's last line sits just above the CTA, no
        // wasted empty space below.
        paddingBottom: 'calc(144px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        {/* Errors */}
        {(error || validationErrors.length > 0) && (
          <div className="p-4 bg-red-50 border border-[#EEEEEE] rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#FF3008] flex-shrink-0 mt-0.5" />
              <div>
                {error && <p className="font-semibold text-[#FF3008] text-[13px]">{error}</p>}
                {validationErrors.length > 0 && (
                  <ul className="mt-1 text-[13px] text-[#FF3008] list-disc list-inside">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CART ITEMS - flat list, disposition identical to MenuItemCard (text left, image right) */}
        <section className="bg-white">
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
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="relative flex bg-white border-b border-[#F0F0F0] last:border-b-0"
                >
                  {/* TEXT - Left side */}
                  <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
                    <div>
                      <h3 className="text-[16px] font-semibold text-[#1A1A1A] leading-tight line-clamp-2">
                        {getTranslatedContent(language, item.name, item.name_en)}
                      </h3>
                      {(optionLabel || variantLabel) && (
                        <p className="mt-1 text-[13px] text-[#737373] line-clamp-2">
                          {[variantLabel, optionLabel].filter(Boolean).join(' - ')}
                        </p>
                      )}
                      <p className="mt-1.5 text-[15px] font-bold text-[#1A1A1A]">
                        {resolveAndFormatPrice(
                          item.price * item.quantity,
                          item.prices,
                          currencyCode,
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => updateQuantity(itemKey, item.quantity - 1)}
                        aria-label={t('ariaDecrease')}
                        className="w-9 h-9 rounded-full border border-[#EEEEEE] flex items-center justify-center text-[#1A1A1A] hover:bg-[#F6F6F6] transition-colors min-h-[36px] min-w-[36px]"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-[16px] font-bold text-[#1A1A1A] w-6 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(itemKey, item.quantity + 1)}
                        aria-label={t('ariaIncrease')}
                        className="w-9 h-9 rounded-full border border-[#EEEEEE] flex items-center justify-center text-[#1A1A1A] hover:bg-[#F6F6F6] transition-colors min-h-[36px] min-w-[36px]"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* IMAGE - Right side (identical to MenuItemCard, with trash overlay instead of add) */}
                  <div className="relative w-[90px] h-[90px] flex-shrink-0 m-3">
                    <div className="w-full h-full rounded-xl overflow-hidden bg-[#F6F6F6] flex items-center justify-center">
                      {item.image_url &&
                      !item.image_url.includes('placeholder') &&
                      !item.image_url.includes('default') ? (
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          width={90}
                          height={90}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Utensils className="w-6 h-6 text-[#B0B0B0]" />
                      )}
                    </div>
                    <button
                      onClick={() => removeFromCart(itemKey)}
                      className="absolute -bottom-2 -right-2 z-10 w-7 h-7 rounded-full bg-white border border-[#EEEEEE] flex items-center justify-center text-[#B0B0B0] hover:text-[#FF3008] transition-colors"
                      aria-label={t('ariaRemoveItem')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </section>

        {/* KITCHEN NOTES - collapsible (hidden until user clicks) */}
        {!notesOpen && !notes ? (
          <section>
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="w-full flex items-center gap-2 text-[14px] font-semibold text-[#1A1A1A] py-3 transition-colors hover:text-black"
            >
              <ChefHat className="w-4 h-4" />
              <span>{t('cartNotesLabel')}</span>
              <ChevronRight className="w-4 h-4 ml-auto text-[#B0B0B0]" />
            </button>
          </section>
        ) : (
          <section>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="cart-notes" className="text-[13px] font-semibold text-[#1A1A1A]">
                {t('cartNotesLabel')}
              </label>
              <button
                type="button"
                onClick={() => {
                  setNotesOpen(false);
                  setNotes('');
                }}
                className="text-[#737373] hover:text-[#1A1A1A]"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <textarea
                id="cart-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX_LENGTH))}
                placeholder={t('cartNotesPlaceholder')}
                maxLength={NOTES_MAX_LENGTH}
                autoFocus
                className="w-full min-h-[80px] bg-[#F6F6F6] border border-[#EEEEEE] rounded-xl px-3 py-3 text-[14px] font-normal text-[#1A1A1A] placeholder:text-[#B0B0B0] focus:outline-none focus:border-[#1A1A1A] resize-none transition-colors"
              />
              <div className="mt-1 flex justify-end">
                <span className="text-[11px] text-[#B0B0B0]">
                  {notesLength}/{NOTES_MAX_LENGTH}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* UPSELL SUGGESTIONS - stable section: visible whenever the cart has items.
            Title is fixed ("Vous aimerez aussi") so the user never sees the heading
            change as suggestions recompute on cart edits. */}
        {items.length > 0 && (upsellItems.length > 0 || isLoadingUpsell) && (
          <section className="overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Utensils className="w-5 h-5 text-[#1A1A1A]" />
                <h2 className="text-[20px] font-bold text-[#1A1A1A]">{t('upsellYouMayLike')}</h2>
              </div>
              <Link href={menuPath} className="text-[14px] font-semibold text-[#1A1A1A]">
                {t('seeAll') || 'See all'}
              </Link>
            </div>

            <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
              <div className="flex gap-3 min-w-max">
                {isLoadingUpsell && upsellItems.length === 0
                  ? [1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-[160px] flex-shrink-0 bg-white rounded-xl border border-[#EEEEEE] animate-pulse overflow-hidden"
                      >
                        <div className="w-full h-[110px] bg-[#F6F6F6]" />
                        <div className="p-2.5">
                          <div className="h-4 w-3/4 bg-[#F6F6F6] rounded mb-2" />
                          <div className="h-3 w-1/2 bg-[#F6F6F6] rounded" />
                        </div>
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
                          className="w-[160px] flex-shrink-0 bg-white rounded-xl border border-[#EEEEEE] overflow-hidden"
                        >
                          <div className="w-full h-[110px] overflow-hidden relative bg-[#F6F6F6] flex items-center justify-center">
                            {hasImage ? (
                              <Image
                                src={item.image_url!}
                                alt={item.name}
                                fill
                                sizes="160px"
                                className="object-cover"
                                onError={() =>
                                  setUpsellImageErrors((prev) => new Set(prev).add(item.id))
                                }
                              />
                            ) : (
                              <Utensils className="w-6 h-6 text-[#B0B0B0]" />
                            )}
                            <button
                              onClick={() => handleAddUpsellItem(item)}
                              className="absolute bottom-2 right-2 z-10 w-7 h-7 rounded-full bg-[#1A1A1A] flex items-center justify-center active:scale-90 transition-all hover:bg-black"
                              aria-label={t('ariaAddUpsell', { name: item.name })}
                            >
                              <Plus className="w-4 h-4 text-white" />
                            </button>
                          </div>
                          <div className="p-2.5">
                            <h3 className="text-[15px] font-semibold text-[#1A1A1A] leading-tight line-clamp-2 mb-1.5">
                              {getTranslatedContent(language, item.name, item.name_en)}
                            </h3>
                            <span className="text-[14px] font-bold text-[#1A1A1A]">
                              {resolveAndFormatPrice(item.price, item.prices, currencyCode)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
              </div>
            </div>
          </section>
        )}

        {/* PROMO CODE - collapsible, hidden until user clicks "Add code" */}
        {appliedCoupon ? (
          <section>
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between gap-3 bg-[#F6F6F6] border border-[#EEEEEE] rounded-xl px-3 py-2.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-white" strokeWidth={3} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#1A1A1A] truncate">
                    {appliedCoupon.code}
                  </p>
                  <p className="text-[11px] text-[#737373]">
                    -{formatDisplayPrice(appliedCoupon.discountAmount, currencyCode)}
                  </p>
                </div>
              </div>
              <button
                onClick={handleRemovePromo}
                aria-label={t('ariaRemovePromo')}
                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-[#737373] hover:text-[#FF3008] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          </section>
        ) : !promoOpen ? (
          <section>
            <button
              type="button"
              onClick={() => setPromoOpen(true)}
              className="w-full flex items-center gap-2 text-[14px] font-semibold text-[#1A1A1A] py-3 transition-colors hover:text-black"
            >
              <Tag className="w-4 h-4" />
              <span>{t('promoCode')}</span>
              <ChevronRight className="w-4 h-4 ml-auto text-[#B0B0B0]" />
            </button>
          </section>
        ) : (
          <section>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="promo-input" className="text-[13px] font-semibold text-[#1A1A1A]">
                {t('promoCode')}
              </label>
              <button
                type="button"
                onClick={() => {
                  setPromoOpen(false);
                  setPromoInput('');
                  setPromoError(null);
                }}
                className="text-[12px] text-[#737373] hover:text-[#1A1A1A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0B0B0]" />
                <input
                  id="promo-input"
                  type="text"
                  value={promoInput}
                  onChange={(e) => {
                    setPromoInput(e.target.value.toUpperCase());
                    if (promoError) setPromoError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyPromo();
                    }
                  }}
                  placeholder={t('promoCodePlaceholder')}
                  autoFocus
                  className="w-full h-[44px] bg-[#F6F6F6] border border-[#EEEEEE] rounded-xl pl-9 pr-3 text-[14px] font-medium text-[#1A1A1A] placeholder:text-[#B0B0B0] focus:outline-none focus:border-[#1A1A1A] transition-colors"
                />
              </div>
              <button
                onClick={handleApplyPromo}
                disabled={!promoInput.trim() || promoApplying}
                className="h-[44px] px-4 rounded-xl bg-[#1A1A1A] text-white text-[14px] font-semibold transition-all hover:bg-black active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center min-w-[90px]"
              >
                {promoApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : t('apply')}
              </button>
            </div>
            <AnimatePresence>
              {promoError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 text-[12px] text-[#FF3008] flex items-center gap-1"
                >
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {promoError}
                </motion.p>
              )}
              {promoJustApplied && !promoError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 text-[12px] text-[#1A1A1A] flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                  {t('promoApplied')}
                </motion.p>
              )}
            </AnimatePresence>
          </section>
        )}

        {/* TIP SELECTOR - collapsible (hidden until user clicks "Add tip") */}
        {!tipOpen && tipAmount === 0 ? (
          <section>
            <button
              type="button"
              onClick={() => setTipOpen(true)}
              className="w-full flex items-center gap-2 text-[14px] font-semibold text-[#1A1A1A] py-3 transition-colors hover:text-black"
            >
              <HandCoins className="w-4 h-4" />
              <span>{t('tip')}</span>
              <ChevronRight className="w-4 h-4 ml-auto text-[#B0B0B0]" />
            </button>
          </section>
        ) : (
          <section className="bg-white rounded-xl border border-[#EEEEEE] p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[13px] font-semibold text-[#1A1A1A]">{t('tip')}</label>
              <button
                type="button"
                onClick={() => {
                  setTipOpen(false);
                  setTipPreset(0);
                  setCustomTipInput('');
                }}
                className="text-[#737373] hover:text-[#1A1A1A]"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: 0, label: t('tipNone') || 'Aucun' },
                  { key: 500, label: formatDisplayPrice(500, currencyCode) },
                  { key: 1000, label: formatDisplayPrice(1000, currencyCode) },
                  { key: 1500, label: formatDisplayPrice(1500, currencyCode) },
                  { key: 2000, label: formatDisplayPrice(2000, currencyCode) },
                  { key: 'custom', label: t('tipCustom') || 'Autre' },
                ] as const
              ).map((opt) => {
                const active = tipPreset === opt.key;
                return (
                  <button
                    key={String(opt.key)}
                    onClick={() => {
                      setTipPreset(opt.key);
                      if (opt.key !== 'custom') setCustomTipInput('');
                    }}
                    className={cn(
                      'min-h-[44px] rounded-xl text-[13px] font-semibold transition-all active:scale-[0.97] flex items-center justify-center px-1',
                      active
                        ? 'bg-[#1A1A1A] text-white border border-[#1A1A1A]'
                        : 'bg-white text-[#737373] border border-[#EEEEEE] hover:border-[#B0B0B0]',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <AnimatePresence>
              {tipPreset === 'custom' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={500}
                      value={customTipInput}
                      onChange={(e) => setCustomTipInput(e.target.value)}
                      placeholder={t('tipCustomPlaceholder')}
                      className="w-full h-[44px] bg-[#F6F6F6] border border-[#EEEEEE] rounded-xl px-3 text-[14px] font-semibold text-[#1A1A1A] placeholder:text-[#B0B0B0] focus:outline-none focus:border-[#1A1A1A] transition-colors"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {/* DETAILED ORDER SUMMARY */}
        <section className="bg-white rounded-xl border border-[#EEEEEE] p-4">
          <div className="space-y-2.5">
            {/* Subtotal */}
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-normal text-[#737373]">{t('subtotal')}</span>
              <span className="text-[15px] font-bold text-[#1A1A1A]">
                {formatDisplayPrice(subtotal, currencyCode)}
              </span>
            </div>

            {/* Tax */}
            {enableTax && taxAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[13px] font-normal text-[#737373]">
                  {t('tax')} ({taxRate}%)
                </span>
                <span className="text-[15px] font-bold text-[#1A1A1A]">
                  {formatDisplayPrice(taxAmount, currencyCode)}
                </span>
              </div>
            )}

            {/* Service charge */}
            {enableServiceCharge && serviceChargeAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[13px] font-normal text-[#737373]">
                  {t('serviceCharge')} ({serviceChargeRate}%)
                </span>
                <span className="text-[15px] font-bold text-[#1A1A1A]">
                  {formatDisplayPrice(serviceChargeAmount, currencyCode)}
                </span>
              </div>
            )}

            {/* Discount */}
            {discountAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[13px] font-normal text-[#737373]">{t('discount')}</span>
                <span className="text-[15px] font-bold text-[#1A1A1A]">
                  -{formatDisplayPrice(discountAmount, currencyCode)}
                </span>
              </div>
            )}

            {/* Tip */}
            {tipAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[13px] font-normal text-[#737373]">{t('tip')}</span>
                <span className="text-[15px] font-bold text-[#1A1A1A]">
                  {formatDisplayPrice(tipAmount, currencyCode)}
                </span>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-[#EEEEEE] pt-3 mt-1">
              <div className="flex justify-between items-center">
                <span className="text-[16px] font-bold text-[#1A1A1A]">{t('total')}</span>
                <span className="text-[20px] font-bold text-[#1A1A1A]">
                  {formatDisplayPrice(finalTotal, currencyCode)}
                </span>
              </div>
              {/* Hint only meaningful when tax or service charge is actually applied */}
              {((enableTax && taxAmount > 0) ||
                (enableServiceCharge && serviceChargeAmount > 0)) && (
                <div className="text-[11px] text-right" style={{ color: '#B0B0B0' }}>
                  {t('totalHint')}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* FLOATING CTA - no bar wrapper, just the button floating above content */}
      <div
        className="fixed left-0 right-0 z-[60] px-4 pointer-events-none"
        style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <div className="max-w-lg mx-auto pointer-events-auto">
          <button
            onClick={handleSubmitOrder}
            disabled={isSubmitting || items.length === 0}
            className="w-full h-[52px] rounded-xl bg-[#1A1A1A] text-white font-semibold text-[15px] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] hover:bg-black shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
          >
            {isSubmitting ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <span>{t('confirmOrder')}</span>
                <span
                  aria-hidden="true"
                  className="inline-block rounded-full bg-white"
                  style={{ width: 5, height: 5 }}
                />
                <span>{formatDisplayPrice(finalTotal, currencyCode)}</span>
              </>
            )}
          </button>
        </div>
      </div>
      {tenantSlug && <BottomNav tenantSlug={tenantSlug} />}
    </main>
  );
}
