'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PaymentElement, useCheckout } from '@stripe/react-stripe-js/checkout';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

// Notre texte d'engagement remplace celui de Stripe (qui affichait le nom
// technique du compte Stripe), et Link (enregistrement chez Stripe) est retire:
// un seul chemin, la carte.
const PAYMENT_ELEMENT_OPTIONS = {
  layout: 'tabs' as const,
  terms: { card: 'never' as const },
  wallets: { link: 'never' as const },
};

// Mobile money: le code d'encaissement existe (Flutterwave), mais les acces
// des operateurs ne sont pas encore ouverts. Affiches, non selectionnables,
// jusqu'a leur ouverture. Noms de marque: pas de traduction.
const SOON_METHODS = ['Orange Money', 'Moov Money', 'Wave', 'MTN MoMo'] as const;

/**
 * Formulaire de carte (Payment Element de Stripe, dans son iframe: ATTABL ne
 * voit jamais le numero) et bouton d'abonnement. En cas de succes, Stripe
 * redirige vers la return_url de la session (/checkout/success).
 */
export function CheckoutPaymentSection() {
  const tc = useTranslations('checkout');
  const result = useCheckout();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = result.type === 'success' && result.checkout.canConfirm;

  const handleSubscribe = async () => {
    if (result.type !== 'success') return;
    setSubmitting(true);
    setError(null);
    try {
      const confirmation = await result.checkout.confirm();
      if (confirmation.type === 'error') {
        setError(confirmation.error.message);
        setSubmitting(false);
      }
    } catch (err) {
      logger.error('Checkout confirm failed', err);
      setError(tc('page.confirmError'));
      setSubmitting(false);
    }
  };

  return (
    <section>
      <h2 className="text-base font-semibold text-zinc-900">{tc('page.paymentMethod')}</h2>
      <div
        role="radiogroup"
        aria-label={tc('page.paymentMethod')}
        className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white"
      >
        <div className="p-4">
          <div role="radio" aria-checked="true" className="flex items-center gap-3">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-zinc-900">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-900" />
            </span>
            <span className="text-sm font-medium text-zinc-900">{tc('page.methodCard')}</span>
          </div>
          <div className="mt-4">
            {/* Session fermee entre-temps (ouverte dans un autre onglet) ou
                reseau coupe: on le dit, au lieu d'un chargement sans fin. */}
            <PaymentElement
              options={PAYMENT_ELEMENT_OPTIONS}
              onLoadError={() => setError(tc('page.loadError'))}
            />
          </div>
        </div>
        {SOON_METHODS.map((name) => (
          <div
            key={name}
            role="radio"
            aria-checked="false"
            aria-disabled="true"
            className="flex items-center gap-3 border-t border-zinc-200 px-4 py-3.5"
          >
            <span className="h-4 w-4 shrink-0 rounded-full border-2 border-zinc-200" />
            <span className="text-sm text-zinc-400">{name}</span>
            <span className="ml-auto shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500">
              {tc('page.comingSoon')}
            </span>
          </div>
        ))}
      </div>

      {(error || result.type === 'error') && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error ?? tc('page.errorDescription')}
        </p>
      )}

      <Button
        type="button"
        onClick={handleSubscribe}
        disabled={!canConfirm || submitting}
        className="mt-6 h-12 w-full rounded-xl bg-zinc-900 text-base font-semibold text-white hover:bg-zinc-800"
      >
        {submitting ? tc('page.subscribing') : tc('page.subscribe')}
      </Button>
      <p className="mt-4 text-xs leading-relaxed text-zinc-500">{tc('page.legal')}</p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">{tc('page.securePayment')}</p>
    </section>
  );
}
