'use client';

import { useCart } from '@/contexts/CartContext';
import { useTenant } from '@/contexts/TenantContext';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import {
  ArrowLeft,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShoppingBag,
  AlertCircle,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import BottomNav from '@/components/tenant/BottomNav';
import { useCartSuggestions, type UpsellItem } from '@/hooks/useCartSuggestions';
import { CartItemsList, getCartItemKey } from '@/components/tenant/cart/CartItemsList';
import { UpsellSection } from '@/components/tenant/cart/UpsellSection';
import { PromoSection } from '@/components/tenant/cart/PromoSection';
import { TipSection, type TipPreset } from '@/components/tenant/cart/TipSection';
import { OrderSummary } from '@/components/tenant/cart/OrderSummary';

const NOTES_MAX_LENGTH = 200;

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

  // Tip
  const [tipPreset, setTipPreset] = useState<TipPreset>(0);
  const [customTipInput, setCustomTipInput] = useState<string>('');
  const [tipOpen, setTipOpen] = useState(false);

  // Notes
  const [notesOpen, setNotesOpen] = useState(false);

  // Promo
  const [promoInput, setPromoInput] = useState<string>('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoJustApplied, setPromoJustApplied] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);

  const submitLock = useRef(false);

  // Tip amount computation
  const tipAmount = useMemo(() => {
    if (tipPreset === 0) return 0;
    if (tipPreset === 'custom') {
      const parsed = parseFloat(customTipInput.replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    return tipPreset;
  }, [tipPreset, customTipInput]);

  // Smart suggestions (hook-owned)
  const { upsellItems, isLoadingUpsell } = useCartSuggestions(items, currentRestaurantId);

  // Handlers
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
    if (submitLock.current) return;
    submitLock.current = true;
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
            modifiers: item.modifiers && item.modifiers.length > 0 ? item.modifiers : undefined,
            customerNotes: item.customerNotes || undefined,
          })),
          notes: notes || undefined,
          display_currency: displayCurrency,
          tip_amount: tipAmount > 0 ? tipAmount : undefined,
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

      // Namespace the stored order IDs per tenant slug.
      const orderIdsStorageKey = `attabl_${tenantSlug}_order_ids`;
      const storedIds: string[] = JSON.parse(localStorage.getItem(orderIdsStorageKey) || '[]');
      if (data.orderId && !storedIds.includes(data.orderId)) {
        storedIds.push(data.orderId);
        localStorage.setItem(orderIdsStorageKey, JSON.stringify(storedIds));
      }

      clearCart();
      setTipPreset(0);
      setCustomTipInput('');
      router.push(`/sites/${tenantSlug}/order-confirmed?orderId=${data.orderId}`);
    } catch (err) {
      logger.error('Order submission error:', err);
      setError(t('connectionError'));
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  };

  // Empty cart state
  if (items.length === 0) {
    return (
      <main className="h-full bg-white pb-20">
        <div className="max-w-lg mx-auto h-14 px-4 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="p-2 -ml-2 min-h-[44px] min-w-[44px] text-[#B0B0B0] hover:text-[#1A1A1A]"
            aria-label={t('ariaGoBack')}
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
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
          <Button
            asChild
            className="h-[52px] px-8 rounded-xl bg-[#1A1A1A] text-white text-[15px] font-semibold hover:bg-black"
          >
            <Link href={menuPath}>
              <ArrowLeft className="w-4 h-4" />
              {t('browseMenu')}
            </Link>
          </Button>
        </div>
        {tenantSlug && <BottomNav tenantSlug={tenantSlug} />}
      </main>
    );
  }

  // Main cart
  const notesLength = notes?.length ?? 0;

  return (
    <main
      className="min-h-full bg-white"
      style={{
        // 144px = 76 (bottom nav anchor) + 52 (CTA height) + 16 breathing room
        paddingBottom: 'calc(144px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        {/* Errors */}
        {(error || validationErrors.length > 0) && (
          <div className="p-4 bg-[#FEF2F2] border border-[#EEEEEE] rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#FF3008] shrink-0 mt-0.5" />
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

        {/* CART ITEMS */}
        <CartItemsList
          items={items}
          language={language}
          currencyCode={currencyCode}
          resolveAndFormatPrice={resolveAndFormatPrice}
          updateQuantity={updateQuantity}
          removeFromCart={removeFromCart}
          labels={{
            decrease: t('ariaDecrease'),
            increase: t('ariaIncrease'),
            remove: t('ariaRemoveItem'),
          }}
        />

        {/* KITCHEN NOTES */}
        {!notesOpen && !notes ? (
          <section>
            <Button
              variant="ghost"
              onClick={() => setNotesOpen(true)}
              className="w-full justify-start gap-2 text-[14px] font-semibold text-[#1A1A1A] py-3 hover:text-black"
            >
              <ChefHat className="w-4 h-4" />
              <span>{t('cartNotesLabel')}</span>
              <ChevronRight className="w-4 h-4 ml-auto text-[#B0B0B0]" />
            </Button>
          </section>
        ) : (
          <section>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="cart-notes" className="text-[13px] font-semibold text-[#1A1A1A]">
                {t('cartNotesLabel')}
              </Label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setNotesOpen(false);
                  setNotes('');
                }}
                className="text-[#737373] hover:text-[#1A1A1A] h-8 w-8"
                aria-label={t('ariaClose') || 'Fermer'}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="relative">
              <Textarea
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

        {/* UPSELL SUGGESTIONS */}
        {items.length > 0 && (
          <UpsellSection
            upsellItems={upsellItems}
            isLoadingUpsell={isLoadingUpsell}
            menuPath={menuPath}
            language={language}
            currencyCode={currencyCode}
            resolveAndFormatPrice={resolveAndFormatPrice}
            onAdd={handleAddUpsellItem}
            labels={{
              title: t('upsellYouMayLike'),
              seeAll: t('seeAll') || 'See all',
              ariaAdd: (name) => t('ariaAddUpsell', { name }),
            }}
          />
        )}

        {/* PROMO CODE */}
        <PromoSection
          appliedCoupon={appliedCoupon}
          promoOpen={promoOpen}
          setPromoOpen={setPromoOpen}
          promoInput={promoInput}
          setPromoInput={setPromoInput}
          promoError={promoError}
          setPromoError={setPromoError}
          promoApplying={promoApplying}
          promoJustApplied={promoJustApplied}
          onApply={handleApplyPromo}
          onRemove={handleRemovePromo}
          currencyCode={currencyCode}
          formatDisplayPrice={formatDisplayPrice}
          labels={{
            promoCode: t('promoCode'),
            promoCodePlaceholder: t('promoCodePlaceholder'),
            apply: t('apply'),
            promoApplied: t('promoApplied'),
            ariaRemovePromo: t('ariaRemovePromo'),
            close: t('close'),
          }}
        />

        {/* TIP SELECTOR */}
        <TipSection
          tipOpen={tipOpen}
          setTipOpen={setTipOpen}
          tipPreset={tipPreset}
          setTipPreset={setTipPreset}
          customTipInput={customTipInput}
          setCustomTipInput={setCustomTipInput}
          tipAmount={tipAmount}
          currencyCode={currencyCode}
          formatDisplayPrice={formatDisplayPrice}
          labels={{
            tip: t('tip'),
            tipNone: t('tipNone') || 'Aucun',
            tipCustom: t('tipCustom') || 'Autre',
            tipCustomPlaceholder: t('tipCustomPlaceholder'),
            close: t('ariaClose') || 'Fermer',
          }}
        />

        {/* ORDER SUMMARY */}
        <OrderSummary
          subtotal={subtotal}
          taxAmount={taxAmount}
          serviceChargeAmount={serviceChargeAmount}
          discountAmount={discountAmount}
          tipAmount={tipAmount}
          finalTotal={finalTotal}
          enableTax={enableTax}
          enableServiceCharge={enableServiceCharge}
          taxRate={taxRate}
          serviceChargeRate={serviceChargeRate}
          currencyCode={currencyCode}
          formatDisplayPrice={formatDisplayPrice}
          labels={{
            subtotal: t('subtotal'),
            tax: t('tax'),
            serviceCharge: t('serviceCharge'),
            discount: t('discount'),
            tip: t('tip'),
            total: t('total'),
            totalHint: t('totalHint'),
          }}
        />
      </div>

      {/* FLOATING CTA */}
      <div
        className="fixed left-0 right-0 z-[60] px-4 pointer-events-none"
        style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <div className="max-w-lg mx-auto pointer-events-auto">
          <Button
            onClick={handleSubmitOrder}
            disabled={isSubmitting || items.length === 0}
            className="w-full h-[52px] rounded-xl bg-[#1A1A1A] text-white font-semibold text-[15px] hover:bg-black shadow-[0_4px_16px_rgba(0,0,0,0.2)] gap-2.5 disabled:opacity-100 disabled:bg-[#1A1A1A]"
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
          </Button>
        </div>
      </div>
      {tenantSlug && <BottomNav tenantSlug={tenantSlug} />}
    </main>
  );
}

// Re-export for external callers that used to import from this file.
export { getCartItemKey };
