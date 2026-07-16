'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Minus, Plus, Utensils, Leaf, Check, X, Star } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCart } from '@/contexts/CartContext';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import type { MenuItem, ItemPriceVariant, ItemModifier } from '@/types/admin.types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getTranslatedContent } from '@/lib/utils/translate';
import { MAX_ITEM_QTY } from '@/lib/utils/cart-display';

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

// --- Group title (variants / options / modifiers) ------------------------

function GroupTitle({
  title,
  required,
  requiredLabel,
  optionalLabel,
}: {
  title: ReactNode;
  required?: boolean;
  requiredLabel: string;
  optionalLabel: string;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="text-[14.5px] font-semibold tracking-[-0.3px] text-[var(--color-ink)]">
        {title}
      </span>
      {required ? (
        <span className="inline-flex items-center rounded-[var(--radius-tag)] border border-[var(--color-divider)] px-2 py-[3px] text-[10.5px] font-semibold tracking-[0.1px] text-[var(--color-ink-muted)]">
          {requiredLabel}
        </span>
      ) : (
        <span className="font-mono text-[11px] uppercase tracking-[0.3px] text-[var(--color-ink-muted)]">
          {optionalLabel}
        </span>
      )}
    </div>
  );
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
  // URLs that failed to load - only the broken slide is dropped, not the whole gallery.
  const [erroredImages, setErroredImages] = useState<Set<string>>(new Set());
  const [activePhoto, setActivePhoto] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [requiredError, setRequiredError] = useState(false);

  // --- Reset state when item changes ------------------------------------

  useEffect(() => {
    if (!item) return;

    setSelectedModifiers([]);
    setQuantity(1);
    setCustomerNotes('');
    setErroredImages(new Set());
    setActivePhoto(0);
    setShowSuccess(false);
    setRequiredError(false);

    if (item.price_variants?.length) {
      const defaultVariant =
        item.price_variants.find((v) => v.is_default) || item.price_variants[0];
      setSelectedVariant(defaultVariant);
    } else {
      setSelectedVariant(null);
    }

    if (item.options?.length) {
      const defaultOpt = item.options.find((o) => o.is_default) || item.options[0];
      setSelectedOption({ name_fr: defaultOpt.name_fr, name_en: defaultOpt.name_en });
    } else {
      setSelectedOption(null);
    }
  }, [item]);

  // --- Body scroll lock + Escape-to-close --------------------------------
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = '';
      return;
    }
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  // --- Live price calculation --------------------------------------------
  const currentPrice = useMemo(() => {
    const base = selectedVariant?.price ?? item?.price ?? 0;
    const modTotal = selectedModifiers.reduce((sum, m) => sum + (m.price || 0), 0);
    return (base + modTotal) * quantity;
  }, [selectedVariant, selectedModifiers, quantity, item]);

  // --- Modifier toggle ---------------------------------------------------
  const toggleModifier = useCallback((modifier: ItemModifier) => {
    setRequiredError(false);
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
    // Choke point: never let an unavailable dish enter the cart, whatever the
    // entry path (deep link ?item=, search, list). The list/search also block it,
    // but this is the single guard that covers every opener.
    if (item.is_available === false) return;

    if (item.modifiers && item.modifiers.length > 0) {
      // Only require modifiers that are actually shown (available). A required
      // but unavailable modifier is hidden from the list, so requiring it would
      // permanently block add-to-cart with no way to satisfy it.
      const requiredModifiers = item.modifiers.filter((m) => m.is_required && m.is_available);
      const missingRequired = requiredModifiers.filter(
        (req) =>
          !selectedModifiers.some(
            (sel) => sel.menu_item_id === req.menu_item_id && sel.id === req.id,
          ),
      );
      if (missingRequired.length > 0) {
        // Surface why nothing happened instead of a silent no-op.
        setRequiredError(true);
        return;
      }
    }
    setRequiredError(false);

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
            id: selectedVariant.id,
            name_fr: selectedVariant.variant_name_fr,
            name_en: selectedVariant.variant_name_en,
            price: selectedVariant.price,
            prices: selectedVariant.prices,
          }
        : undefined,
      modifiers:
        selectedModifiers.length > 0
          ? selectedModifiers.map((m) => ({
              id: m.id,
              name: m.name,
              price: m.price,
              prices: m.prices,
            }))
          : undefined,
      customerNotes: customerNotes.trim() || undefined,
    };

    addToCart(cartItem, restaurantId);

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

  // `images` is jsonb - guard the runtime type (a stray non-string would crash
  // .includes). Also drop placeholder/default and any URL that failed to load.
  const isDisplayableUrl = (u: unknown): u is string =>
    typeof u === 'string' && !u.includes('placeholder') && !u.includes('default');

  // Gallery = the stored images array (primary + variants) when present, else the
  // single image_url. De-duped so repeated URLs do not collide as React keys.
  // Falls back to the utensils placeholder when nothing valid remains.
  const galleryImages = [
    ...new Set(
      (Array.isArray(item.images) && item.images.length > 0
        ? item.images
        : item.image_url
          ? [item.image_url]
          : []
      ).filter(isDisplayableUrl),
    ),
  ].filter((u) => !erroredImages.has(u));
  const hasValidImage = galleryImages.length > 0;
  const isMultiPhoto = galleryImages.length > 1;

  const hasVariants = item.price_variants && item.price_variants.length > 0;
  const hasOptions = item.options && item.options.length > 0;
  const hasModifiers = item.modifiers && item.modifiers.filter((m) => m.is_available).length > 0;
  const hasAllergens = item.allergens && item.allergens.length > 0;
  const itemName = getTranslatedContent(language, item.name, item.name_en);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[60] bg-[rgba(26,26,26,0.5)]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />

          {/* Bottom sheet */}
          <motion.div
            key="sheet"
            className="fixed inset-x-0 bottom-0 top-[46px] z-[61] flex flex-col overflow-hidden rounded-t-[var(--radius-modal)] bg-white shadow-[0_20px_25px_-5px_rgba(26,26,26,0.10),0_8px_10px_-6px_rgba(26,26,26,0.04)]"
            initial={{ y: shouldReduceMotion ? 0 : '100%', opacity: shouldReduceMotion ? 0 : 1 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{
              y: shouldReduceMotion ? 0 : '100%',
              opacity: shouldReduceMotion ? 0 : 1,
              transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] },
            }}
            transition={
              shouldReduceMotion ? { duration: 0.15 } : { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }
            }
          >
            {/* Grabber */}
            <div className="absolute left-1/2 top-2 z-[3] h-1 w-10 -translate-x-1/2 rounded-full bg-white/85" />

            <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
              {/* Hero photo */}
              <div className="relative h-[250px] w-full bg-[var(--color-surface-alt)]">
                {hasValidImage ? (
                  <div
                    className="scrollbar-hide flex h-full w-full snap-x snap-mandatory overflow-x-auto"
                    onScroll={
                      isMultiPhoto
                        ? (e) => {
                            const el = e.currentTarget;
                            setActivePhoto(Math.round(el.scrollLeft / el.clientWidth));
                          }
                        : undefined
                    }
                  >
                    {galleryImages.map((url, idx) => (
                      <div
                        key={`${url}-${idx}`}
                        className="relative h-full w-full min-w-full snap-start"
                      >
                        <Image
                          src={url}
                          alt={isMultiPhoto ? `${itemName} (${idx + 1})` : itemName}
                          fill
                          sizes="100vw"
                          className="object-cover"
                          onError={() => setErroredImages((prev) => new Set(prev).add(url))}
                          priority={idx === 0}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Utensils className="h-12 w-12 text-[var(--color-ink-soft)]" />
                  </div>
                )}
                {isMultiPhoto && (
                  <div className="absolute bottom-3.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
                    {galleryImages.map((url, idx) => (
                      <span
                        key={`${url}-${idx}`}
                        className={`h-1.5 rounded-full transition-all ${
                          idx === activePhoto ? 'w-4 bg-white' : 'w-1.5 bg-white/60'
                        }`}
                      />
                    ))}
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[28%] bg-gradient-to-b from-[rgba(26,26,26,0.22)] to-transparent" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  aria-label={t('close')}
                  className="absolute right-3.5 top-3.5 h-[38px] w-[38px] rounded-full bg-white/90 p-0 shadow-[0_1px_3px_0_rgba(26,26,26,0.06)] backdrop-blur hover:bg-white"
                >
                  <X className="h-[18px] w-[18px] text-[var(--color-ink)]" strokeWidth={2.2} />
                </Button>
                {item.is_featured && (
                  <span className="absolute bottom-3.5 left-4 inline-flex items-center rounded-[var(--radius-tag)] bg-[var(--color-warning-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-warning-fg)]">
                    {t('popularBadge')}
                  </span>
                )}
              </div>

              <div className="px-[18px] pb-6 pt-5">
                {/* Name */}
                <h2 className="text-[22px] font-semibold leading-[1.2] tracking-[-0.7px] text-[var(--color-ink)]">
                  {itemName}
                </h2>

                {/* Meta: rating, kcal, vegetarian */}
                {(item.rating != null || item.calories != null || item.is_vegetarian) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                    {item.rating != null && item.rating > 0 && (
                      <span className="inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums text-[var(--color-ink-2)]">
                        <Star
                          className="text-[var(--color-rating)]"
                          style={{ width: 14, height: 14 }}
                          fill="currentColor"
                          strokeWidth={0}
                        />
                        {item.rating.toFixed(1)}
                        {item.rating_count != null && (
                          <span className="font-normal text-[var(--color-ink-muted)]">
                            ({item.rating_count})
                          </span>
                        )}
                      </span>
                    )}
                    {item.calories != null && item.calories > 0 && (
                      <>
                        <span className="h-[3px] w-[3px] rounded-full bg-[var(--color-ink-soft)]" />
                        <span className="text-[12.5px] font-medium text-[var(--color-ink-muted)]">
                          {t('calories', { n: item.calories })}
                        </span>
                      </>
                    )}
                    {item.is_vegetarian && (
                      <>
                        <span className="h-[3px] w-[3px] rounded-full bg-[var(--color-ink-soft)]" />
                        <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--color-brand-dark)]">
                          <Leaf className="h-3 w-3" />
                          {t('vegetarian')}
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Description */}
                {(item.description || item.description_en) && (
                  <p className="mt-3 text-[14px] leading-[1.55] tracking-[-0.1px] text-[var(--color-ink-2)]">
                    {getTranslatedContent(language, item.description || '', item.description_en)}
                  </p>
                )}

                {/* Allergens */}
                {hasAllergens && (
                  <p className="mt-2 text-[12px] text-[var(--color-ink-muted)]">
                    <span className="font-semibold">{t('allergensLabel')}: </span>
                    {item.allergens!.join(', ')}
                  </p>
                )}

                {/* 1 - Price variants (selectable cards) */}
                {hasVariants && (
                  <div className="mt-6">
                    <GroupTitle
                      title={t('size')}
                      required
                      requiredLabel={t('required')}
                      optionalLabel={t('optionalLabel')}
                    />
                    <div className="flex gap-2" role="radiogroup" aria-label={t('size')}>
                      {item
                        .price_variants!.slice()
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((variant) => {
                          const isActive = selectedVariant?.id === variant.id;
                          return (
                            <Button
                              key={variant.id}
                              type="button"
                              variant="ghost"
                              role="radio"
                              aria-checked={isActive}
                              onClick={() => setSelectedVariant(variant)}
                              className={`h-auto flex-1 flex-col items-stretch gap-0 rounded-[var(--radius-card)] border-[1.5px] px-2 py-3 text-center hover:bg-transparent ${
                                isActive
                                  ? 'border-[var(--color-ink)] shadow-[0_0_0_1px_var(--color-ink)]'
                                  : 'border-[var(--color-divider)]'
                              }`}
                            >
                              <div className="break-words text-[13.5px] font-semibold tracking-[-0.2px] text-[var(--color-ink)]">
                                {getTranslatedContent(
                                  language,
                                  variant.variant_name_fr,
                                  variant.variant_name_en,
                                )}
                              </div>
                              <div className="mt-[3px] text-[12px] font-medium text-[var(--color-ink-2)]">
                                {resolveAndFormatPrice(variant.price, variant.prices, currency)}
                              </div>
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* 2 - Free options (radios) */}
                {hasOptions && (
                  <div className="mt-6">
                    <GroupTitle
                      title={t('optionsTitle')}
                      required
                      requiredLabel={t('required')}
                      optionalLabel={t('optionalLabel')}
                    />
                    <div role="radiogroup" aria-label={t('optionsTitle')}>
                      {item
                        .options!.slice()
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((option) => {
                          const isActive = selectedOption?.name_fr === option.name_fr;
                          return (
                            <Button
                              key={option.id}
                              type="button"
                              variant="ghost"
                              role="radio"
                              aria-checked={isActive}
                              onClick={() =>
                                setSelectedOption({
                                  name_fr: option.name_fr,
                                  name_en: option.name_en,
                                })
                              }
                              className={`mb-[7px] flex h-auto w-full items-center justify-start gap-3 rounded-[var(--radius-search)] border px-3.5 py-[13px] text-left hover:bg-[var(--color-surface-alt)] ${
                                isActive
                                  ? 'border-[var(--color-ink)] bg-[var(--color-surface-alt)]'
                                  : 'border-[var(--color-divider)] bg-white'
                              }`}
                            >
                              <span
                                className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                                  isActive
                                    ? 'border-[var(--color-ink)]'
                                    : 'border-[var(--color-ink-soft)]'
                                }`}
                              >
                                {isActive && (
                                  <span className="h-[9px] w-[9px] rounded-full bg-[var(--color-ink)]" />
                                )}
                              </span>
                              <span className="flex-1 text-[14px] font-medium tracking-[-0.2px] text-[var(--color-ink-2)]">
                                {getTranslatedContent(language, option.name_fr, option.name_en)}
                              </span>
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* 3 - Paid modifiers (checkboxes) */}
                {hasModifiers && (
                  <div className="mt-6">
                    <GroupTitle
                      title={t('extras')}
                      requiredLabel={t('required')}
                      optionalLabel={t('optionalLabel')}
                    />
                    <div role="group" aria-label={t('extras')}>
                      {item
                        .modifiers!.filter((m) => m.is_available)
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((modifier) => {
                          const isActive = selectedModifiers.some((m) => m.id === modifier.id);
                          return (
                            <Button
                              key={modifier.id}
                              type="button"
                              variant="ghost"
                              role="checkbox"
                              aria-checked={isActive}
                              onClick={() => toggleModifier(modifier)}
                              className={`mb-[7px] flex h-auto w-full items-center justify-start gap-3 rounded-[var(--radius-search)] border px-3.5 py-[13px] text-left hover:bg-[var(--color-surface-alt)] ${
                                isActive
                                  ? 'border-[var(--color-ink)] bg-[var(--color-surface-alt)]'
                                  : 'border-[var(--color-divider)] bg-white'
                              }`}
                            >
                              <span
                                className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] ${
                                  isActive
                                    ? 'border-[var(--color-ink)] bg-[var(--color-ink)]'
                                    : 'border-[var(--color-ink-soft)] bg-white'
                                }`}
                              >
                                {isActive && (
                                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                                )}
                              </span>
                              <span className="min-w-0 flex-1 break-words text-[14px] font-medium tracking-[-0.2px] text-[var(--color-ink-2)]">
                                {getTranslatedContent(language, modifier.name, modifier.name_en)}
                              </span>
                              {modifier.price > 0 && (
                                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--color-ink)]">
                                  +
                                  {resolveAndFormatPrice(modifier.price, modifier.prices, currency)}
                                </span>
                              )}
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Kitchen note */}
                <div className="mt-6">
                  <div className="mb-2.5 text-[14.5px] font-semibold tracking-[-0.3px] text-[var(--color-ink)]">
                    {t('specialInstructions')}
                  </div>
                  <Textarea
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder={t('specialInstructionsPlaceholder')}
                    rows={2}
                    className="w-full resize-none rounded-[var(--radius-search)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)] px-3.5 py-3 text-[16px] md:text-[13px] leading-[1.4] tracking-[-0.1px] text-[var(--color-ink)] shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
              <div className="h-[90px]" />
            </div>

            {/* CTA bar: qty stepper + add button */}
            <div
              className="absolute inset-x-0 bottom-0 border-t border-[var(--color-divider)] bg-white/95 px-3.5 pt-3 backdrop-blur"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            >
              {requiredError && (
                <p
                  role="alert"
                  className="mb-2 text-center text-[13px] font-medium text-[var(--destructive)]"
                >
                  {t('selectRequiredOption')}
                </p>
              )}
              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-full border border-[var(--color-divider)] bg-[var(--color-surface-alt)] p-[3px]">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label={t('ariaDecrease')}
                    className="h-8 w-8 rounded-full bg-white p-0 shadow-[0_1px_2px_0_rgba(26,26,26,0.04)] hover:bg-white disabled:opacity-40"
                  >
                    <Minus className="h-3.5 w-3.5 text-[var(--color-ink)]" strokeWidth={2.4} />
                  </Button>
                  <span className="min-w-[30px] text-center text-[14px] font-semibold tabular-nums text-[var(--color-ink)]">
                    {quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQuantity((q) => Math.min(MAX_ITEM_QTY, q + 1))}
                    aria-label={t('ariaIncrease')}
                    className="h-8 w-8 rounded-full bg-[var(--color-ink)] p-0 hover:bg-[var(--color-ink)]"
                  >
                    <Plus className="h-3.5 w-3.5 text-white" strokeWidth={2.4} />
                  </Button>
                </div>
                <Button
                  onClick={handleAddToCart}
                  disabled={showSuccess || item?.is_available === false}
                  className="h-[54px] min-w-0 flex-1 justify-between rounded-full bg-[var(--color-ink)] px-5 text-[15px] font-semibold text-white hover:bg-black"
                >
                  {showSuccess ? (
                    <motion.div
                      className="mx-auto"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 15 }}
                    >
                      <Check className="h-5 w-5" />
                    </motion.div>
                  ) : item?.is_available === false ? (
                    <span className="mx-auto min-w-0 truncate">{t('unavailable')}</span>
                  ) : (
                    <>
                      <span className="min-w-0 truncate">{t('addToCart')}</span>
                      <span className="shrink-0 tabular-nums">
                        {formatDisplayPrice(currentPrice, currency)}
                      </span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
