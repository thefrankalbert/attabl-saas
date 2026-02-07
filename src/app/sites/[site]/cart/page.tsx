'use client';

import { useCart } from '@/contexts/CartContext';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, Minus, ArrowLeft, ShoppingBag, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

export default function CartPage() {
  const { items, updateQuantity, removeFromCart, totalPrice, totalItems, clearCart, notes, setNotes } = useCart();
  useTenant(); // Ensure tenant context is available

  // États pour la soumission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [orderSuccess, setOrderSuccess] = useState<{ orderNumber: string; total: number } | null>(null);

  // Générer une clé unique pour chaque item (avec options/variantes)
  const getItemKey = (item: typeof items[0]) => {
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
          items: items.map(item => ({
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

      // Succès !
      setOrderSuccess({
        orderNumber: data.orderNumber,
        total: data.total,
      });

      // Vider le panier après succès
      clearCart();

    } catch (err) {
      console.error('Order submission error:', err);
      setError('Erreur de connexion. Veuillez réessayer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Affichage succès
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Commande envoyée !</h2>
          <p className="text-gray-600 mb-2">
            Votre commande <span className="font-semibold">{orderSuccess.orderNumber}</span> a été transmise à la cuisine.
          </p>
          <p className="text-2xl font-bold text-amber-600 mb-6">
            {orderSuccess.total.toLocaleString('fr-FR')} F
          </p>
          <Link href={`/`}>
            <Button className="bg-amber-600 hover:bg-amber-700">
              Retour au menu
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Panier vide
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShoppingBag className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Votre panier est vide</h2>
          <p className="text-gray-600 mb-6">
            Commencez à ajouter des articles pour continuer
          </p>
          <Link href={`/`}>
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Retour au menu
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/`} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold">Votre panier</h1>
            <span className="text-sm text-gray-500">({totalItems} articles)</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Erreurs de validation */}
        {(error || validationErrors.length > 0) && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
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

        <div className="grid md:grid-cols-3 gap-6">
          {/* Items List */}
          <div className="md:col-span-2 space-y-3">
            {items.map((item) => {
              const itemKey = getItemKey(item);
              return (
                <div key={itemKey} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex gap-4">
                    {/* Image */}
                    <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 relative">
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingBag className="w-8 h-8 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 line-clamp-1">{item.name}</h3>

                      {/* Option/Variant info */}
                      {(item.selectedOption || item.selectedVariant) && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.selectedOption && item.selectedOption.name_fr}
                          {item.selectedOption && item.selectedVariant && ' • '}
                          {item.selectedVariant && item.selectedVariant.name_fr}
                        </p>
                      )}

                      <p className="text-lg font-bold text-amber-600 mt-2">
                        {item.price.toLocaleString('fr-FR')} F
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-end justify-between">
                      {/* Remove Button */}
                      <button
                        onClick={() => removeFromCart(itemKey)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
                        <button
                          onClick={() => updateQuantity(itemKey, item.quantity - 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors"
                          aria-label="Diminuer la quantité"
                        >
                          <Minus className="w-4 h-4" />
                        </button>

                        <span className="w-8 text-center font-semibold text-sm">
                          {item.quantity}
                        </span>

                        <button
                          onClick={() => updateQuantity(itemKey, item.quantity + 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors"
                          aria-label="Augmenter la quantité"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Notes */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                Notes pour la commande (optionnel)
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Allergies, préférences, instructions spéciales..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                rows={3}
              />
            </div>
          </div>

          {/* Summary Sidebar */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm sticky top-20">
              <h2 className="text-lg font-bold mb-4">Récapitulatif</h2>

              {/* Items Summary */}
              <div className="space-y-2 text-sm">
                {items.map((item) => {
                  const itemKey = getItemKey(item);
                  return (
                    <div key={itemKey} className="flex justify-between">
                      <span className="text-gray-600">
                        {item.quantity}x {item.name.length > 20 ? item.name.substring(0, 20) + '...' : item.name}
                      </span>
                      <span className="font-medium">
                        {(item.price * item.quantity).toLocaleString('fr-FR')} F
                      </span>
                    </div>
                  );
                })}
              </div>

              <hr className="my-4" />

              {/* Total */}
              <div className="flex justify-between items-center mb-6">
                <span className="text-lg font-bold">Total</span>
                <span className="text-xl font-bold text-amber-600">
                  {totalPrice.toLocaleString('fr-FR')} F
                </span>
              </div>

              {/* Actions */}
              <Button
                className="w-full bg-amber-600 hover:bg-amber-700"
                size="lg"
                onClick={handleSubmitOrder}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  'Valider la commande'
                )}
              </Button>

              <Button
                variant="outline"
                className="w-full mt-3"
                onClick={clearCart}
                disabled={isSubmitting}
              >
                Vider le panier
              </Button>

              <Link href={`/`} className="block mt-3">
                <Button variant="ghost" className="w-full" disabled={isSubmitting}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Continuer mes achats
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

