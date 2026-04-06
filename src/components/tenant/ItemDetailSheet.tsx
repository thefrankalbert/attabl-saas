'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Minus, Plus, Utensils, Leaf, Flame, Check, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCart } from '@/contexts/CartContext';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import type { MenuItem, ItemPriceVariant, ItemModifier } from '@/types/admin.types';

const getTranslatedContent = (language: string, fr: string, en?: string | null) => {
  return language === 'en' && en ? en : fr;
};

// ─── Props ──────────────────────────────────────────────────────

interface ItemDetailSheetProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  category?: string;
  currency?: string;
  language?: 'fr' | 'en';
}

// ─── Component ──────────────────────────────────────────────────

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

  // ─── Local state ────────────────────────────────────────────
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

  // ─── Reset state when item changes ──────────────────────────
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!item) return;

    // Reset all selections
    setSelectedModifiers([]);
    setQuantity(1);
    setCustomerNotes('');
    setImageError(false);
    setShowSuccess(false);

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

  // ─── Body scroll lock ───────────────────────────────────────
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

  // ─── Live price calculation ─────────────────────────────────
  const currentPrice = useMemo(() => {
    const base = selectedVariant?.price ?? item?.price ?? 0;
    const modTotal = selectedModifiers.reduce((sum, m) => sum + (m.price || 0), 0);
    return (base + modTotal) * quantity;
  }, [selectedVariant, selectedModifiers, quantity, item]);

  // ─── Modifier toggle ───────────────────────────────────────
  const toggleModifier = useCallback((modifier: ItemModifier) => {
    setSelectedModifiers((prev) => {
      const exists = prev.find((m) => m.id === modifier.id);
      if (exists) {
        return prev.filter((m) => m.id !== modifier.id);
      }
      return [...prev, modifier];
    });
  }, []);

  // ─── Add to cart ────────────────────────────────────────────
  const handleAddToCart = useCallback(() => {
    if (!item) return;

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

    toast.success(`${item.name} ajoute au panier`);
    setShowSuccess(true);

    setTimeout(() => {
      setShowSuccess(false);
      onClose();
    }, 600);
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

  // ─── Derived ────────────────────────────────────────────────
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
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[60] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[95dvh] flex-col rounded-t-3xl bg-app-card"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_event, info) => {
              if (info.offset.y > 100) {
                onClose();
              }
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-app-border" />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Hero image */}
              <div className="relative aspect-[4/3] w-full bg-app-elevated">
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
                    <Utensils className="h-12 w-12 text-app-text-muted" />
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-app-card to-transparent" />
                {/* Close button on image */}
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white transition-colors active:bg-black/60"
                  aria-label="Fermer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="px-5 pb-4 pt-4">
                {/* Title - full width, no truncation */}
                <div>
                  <h2 className="text-2xl font-bold text-app-text">
                    {getTranslatedContent(language, item.name, item.name_en)}
                  </h2>
                </div>

                {/* Diet badges */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.is_vegetarian && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                      <Leaf className="h-3 w-3" />
                      {t('vegetarian')}
                    </span>
                  )}
                  {item.is_spicy && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
                      <Flame className="h-3 w-3" />
                      {t('spicy')}
                    </span>
                  )}
                  {hasAllergens && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      {t('allergenWarning')}
                    </span>
                  )}
                </div>

                {/* Allergen detail list */}
                {hasAllergens && (
                  <p className="mt-1.5 text-xs text-amber-600">{item.allergens!.join(', ')}</p>
                )}

                {/* Description */}
                {(item.description || item.description_en) && (
                  <p className="mt-3 text-base leading-relaxed text-app-text-secondary">
                    {getTranslatedContent(language, item.description || '', item.description_en)}
                  </p>
                )}

                {/* Price (when no variants) */}
                {!hasVariants && (
                  <p className="mt-3 text-lg font-bold" style={{ color: 'var(--tenant-primary)' }}>
                    {resolveAndFormatPrice(item.price, item.prices, currency)}
                  </p>
                )}

                {/* ─── Variants (radio) ─────────────────────────── */}
                {hasVariants && (
                  <div className="mt-5">
                    <h3 className="mb-2 text-sm font-semibold text-app-text">{t('size')}</h3>
                    <div className="flex flex-col gap-2">
                      {item
                        .price_variants!.sort((a, b) => a.display_order - b.display_order)
                        .map((variant) => {
                          const isActive = selectedVariant?.id === variant.id;
                          return (
                            <button
                              key={variant.id}
                              onClick={() => setSelectedVariant(variant)}
                              className="flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all"
                              style={{
                                borderColor: isActive
                                  ? 'var(--tenant-primary)'
                                  : 'var(--app-border)',
                              }}
                            >
                              <div className="flex items-center gap-3">
                                {/* Radio dot */}
                                <div
                                  className="flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors"
                                  style={{
                                    borderColor: isActive
                                      ? 'var(--tenant-primary)'
                                      : 'var(--app-border)',
                                  }}
                                >
                                  {isActive && (
                                    <div
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{
                                        backgroundColor: 'var(--tenant-primary)',
                                      }}
                                    />
                                  )}
                                </div>
                                <span className="text-sm font-medium text-app-text">
                                  {getTranslatedContent(
                                    language,
                                    variant.variant_name_fr,
                                    variant.variant_name_en,
                                  )}
                                </span>
                              </div>
                              <span
                                className="text-sm font-bold"
                                style={{ color: 'var(--tenant-primary)' }}
                              >
                                {resolveAndFormatPrice(variant.price, variant.prices, currency)}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* ─── Modifiers (checkboxes) ───────────────────── */}
                {hasModifiers && (
                  <div className="mt-5">
                    <h3 className="mb-2 text-sm font-semibold text-app-text">{t('extras')}</h3>
                    <div className="flex flex-col gap-2">
                      {item
                        .modifiers!.filter((m) => m.is_available)
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((modifier) => {
                          const isActive = selectedModifiers.some((m) => m.id === modifier.id);
                          return (
                            <button
                              key={modifier.id}
                              onClick={() => toggleModifier(modifier)}
                              className="flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all"
                              style={{
                                borderColor: isActive
                                  ? 'var(--tenant-primary)'
                                  : 'var(--app-border)',
                              }}
                            >
                              <div className="flex items-center gap-3">
                                {/* Checkbox */}
                                <div
                                  className="flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors"
                                  style={{
                                    borderColor: isActive
                                      ? 'var(--tenant-primary)'
                                      : 'var(--app-border)',
                                    backgroundColor: isActive
                                      ? 'var(--tenant-primary)'
                                      : 'transparent',
                                  }}
                                >
                                  {isActive && <Check className="h-3 w-3 text-white" />}
                                </div>
                                <span className="text-sm font-medium text-app-text">
                                  {getTranslatedContent(language, modifier.name, modifier.name_en)}
                                </span>
                              </div>
                              {modifier.price > 0 && (
                                <span className="text-sm font-medium text-app-text-secondary">
                                  +
                                  {resolveAndFormatPrice(modifier.price, modifier.prices, currency)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* ─── Special instructions ─────────────────────── */}
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-semibold text-app-text">
                    {t('specialInstructions')}
                  </h3>
                  <textarea
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder={t('specialInstructionsPlaceholder')}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-app-border/50 bg-app-elevated px-4 py-3 text-sm text-app-text placeholder:text-app-text-muted focus:border-app-border focus:outline-none focus:ring-0"
                  />
                </div>
              </div>
            </div>

            {/* ─── Sticky footer ──────────────────────────────── */}
            <div
              className="border-t border-app-border/50 bg-app-card/90 backdrop-blur-xl px-4 py-4"
              style={{
                paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
              }}
            >
              <div className="flex items-center gap-3">
                {/* Quantity controls */}
                <div className="flex items-center bg-app-bg rounded-xl">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-l-xl text-app-text-secondary transition-colors active:bg-app-elevated"
                    disabled={quantity <= 1}
                    aria-label="Diminuer la quantite"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-lg font-bold text-app-text">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-r-xl text-app-text-secondary transition-colors active:bg-app-elevated"
                    aria-label="Augmenter la quantite"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Add to cart button — flex-1 + whitespace-nowrap = NEVER truncates */}
                <button
                  onClick={handleAddToCart}
                  disabled={showSuccess}
                  className="flex flex-1 h-12 items-center justify-center gap-2 rounded-xl text-base font-bold text-white whitespace-nowrap transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: showSuccess ? 'rgb(34 197 94)' : 'var(--tenant-primary)',
                  }}
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
                      <span>-</span>
                      <span>{formatDisplayPrice(currentPrice, currency)}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
