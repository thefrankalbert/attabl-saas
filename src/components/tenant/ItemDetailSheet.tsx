'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Minus,
  Plus,
  Utensils,
  Leaf,
  Flame,
  Check,
  AlertTriangle,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCart } from '@/contexts/CartContext';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import type { MenuItem, ItemPriceVariant, ItemModifier } from '@/types/admin.types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getTranslatedContent } from '@/lib/utils/translate';

// --- Props ---------------------------------------------------------------

interface ItemDetailSheetProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  category?: string;
  currency?: string;
  language?: 'fr' | 'en';
}

// --- Component -----------------------------------------------------------

export default function ItemDetailSheet({
  item,
  isOpen,
  onClose,
  restaurantId,
  category = '',
  currency = 'XOF',
  language = 'fr',
}: ItemDetailSheetProps) {
  const { addToCart } = useCart();
  const t = useTranslations('tenant');
  const { formatDisplayPrice, resolveAndFormatPrice } = useDisplayCurrency();
  const shouldReduceMotion = useReducedMotion();

  // --- Local state -------------------------------------------------------
  const [selectedVariant, setSelectedVariant] = useState<ItemPriceVariant | null>(null);
  const [selectedOption, setSelectedOption] = useState<{
    name_fr: string;
    name_en?: string;
  } | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<ItemModifier[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [customerNotes, setCustomerNotes] = useState('');
  const [imageError, setImageError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);

  // --- Reset state when item changes ------------------------------------
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: syncing multiple state fields when item prop changes; item is an external boundary requiring full reset on each new selection (2026-05-04) */
  useEffect(() => {
    if (!item) return;

    // Reset all selections
    setSelectedModifiers([]);
    setQuantity(1);
    setCustomerNotes('');
    setImageError(false);
    setShowSuccess(false);
    setNotesExpanded(false);

    // Default variant
    if (item.price_variants?.length) {
      const defaultVariant =
        item.price_variants.find((v) => v.is_default) || item.price_variants[0];
      setSelectedVariant(defaultVariant);
    } else {
      setSelectedVariant(null);
    }

    // Default option
    if (item.options?.length) {
      const defaultOpt = item.options.find((o) => o.is_default) || item.options[0];
      setSelectedOption({
        name_fr: defaultOpt.name_fr,
        name_en: defaultOpt.name_en,
      });
    } else {
      setSelectedOption(null);
    }
  }, [item]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // --- Body scroll lock --------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // --- Live price calculation --------------------------------------------
  const currentPrice = useMemo(() => {
    const base = selectedVariant?.price ?? item?.price ?? 0;
    const modTotal = selectedModifiers.reduce((sum, m) => sum + (m.price || 0), 0);
    return (base + modTotal) * quantity;
  }, [selectedVariant, selectedModifiers, quantity, item]);

  // --- Modifier toggle ---------------------------------------------------
  const toggleModifier = useCallback((modifier: ItemModifier) => {
    setSelectedModifiers((prev) => {
      const exists = prev.find((m) => m.id === modifier.id);
      if (exists) {
        return prev.filter((m) => m.id !== modifier.id);
      }
      return [...prev, modifier];
    });
  }, []);

  // --- Add to cart -------------------------------------------------------
  const handleAddToCart = useCallback(() => {
    if (!item) return;

    // Validate required modifiers
    if (item.modifiers && item.modifiers.length > 0) {
      const requiredModifiers = item.modifiers.filter((m) => m.is_required);
      const missingRequired = requiredModifiers.filter(
        (req) =>
          !selectedModifiers.some(
            (sel) => sel.menu_item_id === req.menu_item_id && sel.id === req.id,
          ),
      );
      if (missingRequired.length > 0) {
        // Shake effect or visual feedback - for now just return
        return;
      }
    }

    const cartItem = {
      id: item.id,
      name: item.name,
      name_en: item.name_en ?? undefined,
      price: selectedVariant?.price ?? item.price,
      prices: item.prices,
      image_url: item.image_url,
      quantity,
      category_id: item.category_id,
      category_name: category,
      selectedOption: selectedOption ?? undefined,
      selectedVariant: selectedVariant
        ? {
            name_fr: selectedVariant.variant_name_fr,
            name_en: selectedVariant.variant_name_en,
            price: selectedVariant.price,
            prices: selectedVariant.prices,
          }
        : undefined,
      modifiers:
        selectedModifiers.length > 0
          ? selectedModifiers.map((m) => ({ name: m.name, price: m.price, prices: m.prices }))
          : undefined,
      customerNotes: customerNotes.trim() || undefined,
    };

    addToCart(cartItem, restaurantId);

    // Haptic feedback for mobile devices
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }

    setShowSuccess(true);

    setTimeout(() => {
      setShowSuccess(false);
      onClose();
    }, 400);
  }, [
    item,
    selectedVariant,
    selectedOption,
    selectedModifiers,
    quantity,
    customerNotes,
    category,
    addToCart,
    restaurantId,
    onClose,
  ]);

  // --- Derived -----------------------------------------------------------
  if (!item) return null;

  const hasValidImage =
    item.image_url &&
    !item.image_url.includes('placeholder') &&
    !item.image_url.includes('default') &&
    !imageError;

  const hasVariants = item.price_variants && item.price_variants.length > 0;
  const hasModifiers = item.modifiers && item.modifiers.filter((m) => m.is_available).length > 0;
  const hasAllergens = item.allergens && item.allergens.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Full-page overlay (not a modal sheet) */}
          <motion.div
            key="sheet"
            className="fixed inset-0 z-[61] flex h-dvh max-h-dvh flex-col bg-white"
            initial={{ x: shouldReduceMotion ? 0 : '100%', opacity: shouldReduceMotion ? 0 : 1 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{
              x: shouldReduceMotion ? 0 : '100%',
              opacity: shouldReduceMotion ? 0 : 1,
              transition: shouldReduceMotion
                ? { duration: 0.15 }
                : { duration: 0.2, ease: [0.32, 0.72, 0, 1] },
            }}
            transition={
              shouldReduceMotion ? { duration: 0.15 } : { duration: 0.28, ease: [0.32, 0.72, 0, 1] }
            }
          >
            {/* Hero image - flex-shrink-0 so it doesn't squeeze, sized for no-scroll fit */}
            <div className="flex-shrink-0">
              <div className="relative h-[200px] w-full bg-[var(--color-surface-alt)]">
                {hasValidImage ? (
                  <Image
                    src={item.image_url!}
                    alt={getTranslatedContent(language, item.name, item.name_en)}
                    fill
                    sizes="100vw"
                    className="object-cover"
                    onError={() => setImageError(true)}
                    priority
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Utensils className="h-12 w-12 text-[var(--color-ink-muted)]" />
                  </div>
                )}
                {/* Back button - top-left, full-page style */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onClose}
                  className="absolute top-3 left-3 z-10 rounded-full bg-white min-h-[44px] min-w-[44px] border-[var(--color-divider)] active:bg-neutral-100"
                  aria-label={t('ariaGoBack')}
                >
                  <ChevronLeft className="h-5 w-5 text-[var(--color-ink)]" />
                </Button>
              </div>
            </div>

            {/* Scrollable content (flex-1) - scroll inside this area only, button stays put */}
            <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
              <div className="px-6 pb-3 pt-4">
                {/* Category label */}
                {category && (
                  <p className="font-medium uppercase text-[11px] leading-[15.4px] tracking-[1px] text-[var(--color-ink-muted)]">
                    {category}
                  </p>
                )}

                {/* Name - prominent title on full page */}
                <h2 className="mt-2 font-bold text-2xl leading-[32px] text-[var(--color-ink)]">
                  {getTranslatedContent(language, item.name, item.name_en)}
                </h2>

                {/* Description - full text, readable */}
                {(item.description || item.description_en) && (
                  <p className="mt-2 font-normal text-[15px] leading-[22px] text-[var(--color-ink-2)]">
                    {getTranslatedContent(language, item.description || '', item.description_en)}
                  </p>
                )}

                {/* Price (when no variants) - DESIGN.MD: price #1A1A1A (NOT green) */}
                {!hasVariants && (
                  <p className="mt-2 font-bold text-[15px] leading-[21px] text-[var(--color-ink)]">
                    {resolveAndFormatPrice(item.price, item.prices, currency)}
                  </p>
                )}

                {/* Divider - compacted */}
                <div className="my-3 h-px bg-[var(--color-divider)]" />

                {/* Tags row - diet badges + allergens */}
                {(item.is_vegetarian || item.is_spicy || hasAllergens) && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.is_vegetarian && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-[11px] rounded-lg bg-[var(--color-surface-alt)] text-[var(--color-ink)]">
                          <Leaf className="h-3 w-3" />
                          {t('vegetarian')}
                        </span>
                      )}
                      {item.is_spicy && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-[11px] rounded-lg bg-[var(--color-surface-alt)] text-danger">
                          <Flame className="h-3 w-3" />
                          {t('spicy')}
                        </span>
                      )}
                      {hasAllergens && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-[11px] rounded-lg bg-[var(--color-surface-alt)] text-allergen">
                          <AlertTriangle className="h-3 w-3" />
                          {t('allergenWarning')}
                        </span>
                      )}
                    </div>

                    {/* Allergen detail list */}
                    {hasAllergens && (
                      <p className="mt-1.5 text-xs text-allergen">{item.allergens!.join(', ')}</p>
                    )}

                    {/* Divider */}
                    <div className="my-3 h-px bg-[var(--color-divider)]" />
                  </>
                )}

                {/* --- Variants (radio) ---------------------------------- */}
                {hasVariants && (
                  <>
                    <div>
                      <h3 className="mb-2 font-semibold text-sm text-[var(--color-ink)]">
                        {t('size')}
                      </h3>
                      <div className="flex flex-col gap-2">
                        {item
                          .price_variants!.sort((a, b) => a.display_order - b.display_order)
                          .map((variant) => {
                            const isActive = selectedVariant?.id === variant.id;
                            return (
                              <Button
                                key={variant.id}
                                variant="outline"
                                onClick={() => setSelectedVariant(variant)}
                                className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left h-auto ${isActive ? 'border-[var(--color-ink)]' : 'border-[var(--color-divider)]'}`}
                              >
                                <div className="flex items-center gap-3">
                                  {/* Radio dot */}
                                  <div
                                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${isActive ? 'border-[var(--color-ink)]' : 'border-[var(--color-divider)]'}`}
                                  >
                                    {isActive && (
                                      <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-ink)]" />
                                    )}
                                  </div>
                                  <span className="font-medium text-sm text-[var(--color-ink)]">
                                    {getTranslatedContent(
                                      language,
                                      variant.variant_name_fr,
                                      variant.variant_name_en,
                                    )}
                                  </span>
                                </div>
                                {/* DESIGN.MD: price is #1A1A1A, NOT green */}
                                <span className="font-bold text-sm text-[var(--color-ink)]">
                                  {resolveAndFormatPrice(variant.price, variant.prices, currency)}
                                </span>
                              </Button>
                            );
                          })}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="my-3 h-px bg-[var(--color-divider)]" />
                  </>
                )}

                {/* --- Modifiers (checkboxes) ----------------------------- */}
                {hasModifiers && (
                  <>
                    <div>
                      <h3 className="mb-2 font-semibold text-sm text-[var(--color-ink)]">
                        {t('extras')}
                      </h3>
                      <div className="flex flex-col gap-2">
                        {item
                          .modifiers!.filter((m) => m.is_available)
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((modifier) => {
                            const isActive = selectedModifiers.some((m) => m.id === modifier.id);
                            return (
                              <Button
                                key={modifier.id}
                                variant="outline"
                                onClick={() => toggleModifier(modifier)}
                                className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left h-auto ${isActive ? 'border-[var(--color-ink)]' : 'border-[var(--color-divider)]'}`}
                              >
                                <div className="flex items-center gap-3">
                                  {/* Checkbox */}
                                  <div
                                    className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${isActive ? 'border-[var(--color-ink)] bg-[var(--color-ink)]' : 'border-[var(--color-divider)] bg-transparent'}`}
                                  >
                                    {isActive && <Check className="h-3 w-3 text-white" />}
                                  </div>
                                  <span className="font-medium text-sm text-[var(--color-ink)]">
                                    {getTranslatedContent(
                                      language,
                                      modifier.name,
                                      modifier.name_en,
                                    )}
                                  </span>
                                </div>
                                {modifier.price > 0 && (
                                  <span className="font-medium text-sm text-[var(--color-ink-2)]">
                                    +
                                    {resolveAndFormatPrice(
                                      modifier.price,
                                      modifier.prices,
                                      currency,
                                    )}
                                  </span>
                                )}
                              </Button>
                            );
                          })}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="my-3 h-px bg-[var(--color-divider)]" />
                  </>
                )}

                {/* --- Quantity selector - compact pill, LEFT-aligned, above instructions --- */}
                <div className="mb-3 flex justify-start">
                  <div className="inline-flex items-center h-[44px] rounded-full border border-[var(--color-divider)] bg-[var(--color-surface-alt)] px-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="min-h-[44px] min-w-[44px] active:opacity-60"
                      disabled={quantity <= 1}
                      aria-label={t('ariaDecrease')}
                    >
                      <Minus className="h-4 w-4 text-[var(--color-ink)]" />
                    </Button>

                    <span className="font-bold text-center text-base text-[var(--color-ink)] min-w-8">
                      {quantity}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="min-h-[44px] min-w-[44px] active:opacity-60"
                      aria-label={t('ariaIncrease')}
                    >
                      <Plus className="h-4 w-4 text-[var(--color-ink)]" />
                    </Button>
                  </div>
                </div>

                {/* --- Special instructions (collapsed trigger, expand on tap) --- */}
                {notesExpanded || customerNotes ? (
                  <div className="rounded-xl bg-[var(--color-surface-alt)] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-semibold text-[var(--color-ink)]">
                        {t('specialInstructions')}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setNotesExpanded(false);
                          setCustomerNotes('');
                        }}
                        className="min-h-[44px] min-w-[44px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] focus-visible:ring-0"
                        aria-label={t('close')}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <Textarea
                      autoFocus={notesExpanded && !customerNotes}
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      placeholder={t('specialInstructionsPlaceholder')}
                      rows={3}
                      className="w-full resize-none border-0 shadow-none px-0 py-0 font-normal focus:outline-none focus-visible:ring-0 text-[13px] text-[var(--color-ink)] bg-transparent"
                    />
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setNotesExpanded(true)}
                    className="w-full justify-start gap-2 text-[14px] font-semibold text-[var(--color-ink)] py-3 hover:text-black"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>{t('specialInstructions')}</span>
                    <ChevronRight className="w-4 h-4 ml-auto text-[var(--color-ink-soft)]" />
                  </Button>
                )}
              </div>
            </div>

            {/* --- Add to cart button - independent zone (flex-shrink-0), bouton avec respiration autour, meme fond blanc continu --- */}
            <div
              className="flex-shrink-0 bg-white px-6 pt-2"
              style={{
                paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
              }}
            >
              <Button
                onClick={handleAddToCart}
                disabled={showSuccess}
                className="w-full gap-1.5 font-semibold text-white h-[52px] rounded-xl text-[15px] bg-[var(--color-ink)] hover:bg-black"
              >
                {showSuccess ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 15 }}
                  >
                    <Check className="h-5 w-5" />
                  </motion.div>
                ) : (
                  <>
                    <span>{t('addToCart')}</span>
                    <span
                      aria-hidden="true"
                      className="inline-block rounded-full bg-white w-[5px] h-[5px]"
                    />
                    <span className="text-white">{formatDisplayPrice(currentPrice, currency)}</span>
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
