'use client';

import { useCart } from '@/contexts/CartContext';
import { useTenant } from '@/contexts/TenantContext';
import { Plus, Minus, ArrowLeft, Utensils, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { logger } from '@/lib/logger';
import { useTranslations } from 'next-intl';

export default function CartPage() {
  const {
    items,
    updateQuantity,
    totalItems,
    clearCart,
    notes,
    setNotes,
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
  const { slug: tenantSlug, tenantId } = useTenant();
  const t = useTranslations('tenant');
  const menuPath = `/sites/${tenantSlug}`;

  // États pour la soumission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [orderSuccess, setOrderSuccess] = useState<{ orderNumber: string; total: number } | null>(
    null,
  );

  // Générer une clé unique pour chaque item (avec options/variantes)
  const getItemKey = (item: (typeof items)[0]) => {
    let key = item.id;
    if (item.selectedOption) key += `-opt-${item.selectedOption.name_fr}`;
    if (item.selectedVariant) key += `-var-${item.selectedVariant.name_fr}`;
    return key;
  };

  // Soumettre la commande
  const handleSubmitOrder = async () => {
    setIsSubmitting(true);
    setError(null);
    setValidationErrors([]);

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          table_number: localStorage.getItem('attabl_table') || undefined,
          items: items.map((item) => ({
            id: item.id,
            name: item.name,
            name_en: item.name_en,
            price: item.price,
            quantity: item.quantity,
            category_name: item.category_name,
            selectedOption: item.selectedOption,
            selectedVariant: item.selectedVariant,
          })),
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details && Array.isArray(data.details)) {
          setValidationErrors(data.details);
        }
        setError(data.error || 'Erreur lors de la commande');
        return;
      }

      // Succès — sauvegarder l'ID de commande en localStorage pour le suivi
      const storedIds: string[] = JSON.parse(localStorage.getItem('attabl_order_ids') || '[]');
      if (data.orderId && !storedIds.includes(data.orderId)) {
        storedIds.push(data.orderId);
        localStorage.setItem('attabl_order_ids', JSON.stringify(storedIds));
      }

      setOrderSuccess({
        orderNumber: data.orderNumber,
        total: data.total,
      });

      // Vider le panier après succès
      clearCart();
    } catch (err) {
      logger.error('Order submission error:', err);
      setError('Erreur de connexion. Veuillez réessayer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Affichage succès
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">{t('orderSent')}</h2>
          <p className="text-neutral-600 mb-2">
            {t('orderSentDesc', { number: orderSuccess.orderNumber })}
          </p>
          <p className="text-2xl font-bold mb-6" style={{ color: 'var(--tenant-primary)' }}>
            {orderSuccess.total.toLocaleString('fr-FR')} F
          </p>
          <div className="flex flex-col gap-3">
            <Link href={`/sites/${tenantSlug}/orders`}>
              <button
                className="w-full h-12 rounded-xl text-white font-semibold transition-transform active:scale-[0.98]"
                style={{ backgroundColor: 'var(--tenant-primary)' }}
              >
                {t('trackOrder')}
              </button>
            </Link>
            <Link href={menuPath}>
              <button className="w-full h-12 rounded-xl border border-neutral-200 font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors">
                {t('backToMenu')}
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Panier vide
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Utensils className="w-10 h-10 text-neutral-400" />
          </div>
          <h2 className="text-2xl font-bold mb-4">{t('emptyCart')}</h2>
          <p className="text-neutral-600 mb-6">{t('emptyCartDesc')}</p>
          <Link href={menuPath}>
            <button
              className="h-12 px-6 rounded-xl text-white font-semibold inline-flex items-center gap-2 transition-transform active:scale-[0.98]"
              style={{ backgroundColor: 'var(--tenant-primary)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              {t('browseMenu')}
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Header — frosted glass */}
      <header className="sticky top-0 z-40">
        <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-b border-neutral-100" />
        <div className="relative flex items-center gap-3 px-4 py-3 max-w-4xl mx-auto">
          <Link href={menuPath} className="p-2 rounded-full hover:bg-neutral-100 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-neutral-900">
            {t('yourCart')}{' '}
            <span className="text-sm font-normal text-neutral-500">
              ({t('itemCount', { count: totalItems })})
            </span>
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-32 space-y-4">
        {/* Erreurs de validation */}
        {(error || validationErrors.length > 0) && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                {error && <p className="font-medium text-red-800">{error}</p>}
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

        {/* Cart items card */}
        <div className="bg-white rounded-2xl border border-neutral-100 divide-y divide-neutral-50">
          {items.map((item) => {
            const itemKey = getItemKey(item);
            return (
              <div key={itemKey} className="flex items-center gap-3 p-4">
                {/* Thumbnail 48×48 */}
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-neutral-100 relative">
                  {item.image_url ? (
                    <Image src={item.image_url} alt={item.name} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Utensils className="w-5 h-5 text-neutral-300" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-neutral-900 truncate">{item.name}</h3>
                  {(item.selectedOption || item.selectedVariant) && (
                    <p className="text-xs text-neutral-400 truncate">
                      {item.selectedOption && item.selectedOption.name_fr}
                      {item.selectedOption && item.selectedVariant && ' · '}
                      {item.selectedVariant && item.selectedVariant.name_fr}
                    </p>
                  )}
                </div>

                {/* Quantity + Price */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateQuantity(itemKey, item.quantity - 1)}
                      className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 transition-colors"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-bold min-w-[20px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(itemKey, item.quantity + 1)}
                      className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 transition-colors"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span
                    className="text-sm font-bold min-w-[60px] text-right"
                    style={{ color: 'var(--tenant-primary)' }}
                  >
                    {(item.price * item.quantity).toLocaleString('fr-FR')} F
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Notes card */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-4">
          <label htmlFor="notes" className="block text-sm font-semibold text-neutral-900 mb-2">
            {t('specialInstructions')}
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('specialInstructionsPlaceholder')}
            className="w-full px-3 py-2 border border-neutral-100 rounded-xl text-sm resize-none h-20 focus:outline-none focus:border-neutral-300"
          />
        </div>

        {/* Summary card */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-5">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-neutral-600">
              <span>{t('subtotal')}</span>
              <span>
                {subtotal.toLocaleString('fr-FR')} {currencyCode === 'XAF' ? 'F' : currencyCode}
              </span>
            </div>
            {enableTax && taxAmount > 0 && (
              <div className="flex justify-between text-neutral-600">
                <span>
                  {t('tax')} ({taxRate}%)
                </span>
                <span>
                  {taxAmount.toLocaleString('fr-FR')} {currencyCode === 'XAF' ? 'F' : currencyCode}
                </span>
              </div>
            )}
            {enableServiceCharge && serviceChargeAmount > 0 && (
              <div className="flex justify-between text-neutral-600">
                <span>
                  {t('serviceCharge')} ({serviceChargeRate}%)
                </span>
                <span>
                  {serviceChargeAmount.toLocaleString('fr-FR')}{' '}
                  {currencyCode === 'XAF' ? 'F' : currencyCode}
                </span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>{t('discount')}</span>
                <span>
                  -{discountAmount.toLocaleString('fr-FR')}{' '}
                  {currencyCode === 'XAF' ? 'F' : currencyCode}
                </span>
              </div>
            )}
            <div className="border-t border-neutral-100 pt-2 mt-2">
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-neutral-900">{t('total')}</span>
                <span className="text-xl font-bold" style={{ color: 'var(--tenant-primary)' }}>
                  {grandTotal.toLocaleString('fr-FR')} {currencyCode === 'XAF' ? 'F' : currencyCode}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmitOrder}
            disabled={isSubmitting}
            className="w-full h-12 rounded-xl text-white font-semibold mt-4 transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: 'var(--tenant-primary)' }}
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              t('confirmOrder')
            )}
          </button>

          <button
            onClick={clearCart}
            className="w-full text-sm text-neutral-400 mt-3 hover:text-neutral-600 transition-colors"
          >
            {t('clearCart')}
          </button>
        </div>
      </main>

      {/* Mobile Sticky Bottom Bar — visible only on phones */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-neutral-100 px-4 pt-3 z-50 lg:hidden shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
        style={{ paddingBottom: `max(env(safe-area-inset-bottom, 12px), 12px)` }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-neutral-500">{t('total')}</span>
          <span className="text-lg font-bold" style={{ color: 'var(--tenant-primary)' }}>
            {grandTotal.toLocaleString('fr-FR')} {currencyCode === 'XAF' ? 'F' : currencyCode}
          </span>
        </div>
        <button
          className="w-full h-12 rounded-xl text-white text-base font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
          onClick={handleSubmitOrder}
          disabled={isSubmitting}
          style={{ backgroundColor: 'var(--tenant-primary)' }}
        >
          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : t('confirmOrder')}
        </button>
      </div>
    </div>
  );
}
