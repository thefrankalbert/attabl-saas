'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { loadStripe } from '@stripe/stripe-js';
import { CheckoutElementsProvider } from '@stripe/react-stripe-js/checkout';
import { Button } from '@/components/ui/button';
import { PLAN_NAMES } from '@/lib/plans/features';
import type { BillingInterval } from '@/types/billing';
import type { SelfServicePlan } from '@/components/tenant/subscription/pricing-format';
import { CheckoutIntervalPicker } from './CheckoutIntervalPicker';
import { CheckoutPaymentSection } from './CheckoutPaymentSection';
import { CheckoutSummary } from './CheckoutSummary';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// Le formulaire Stripe vit dans une iframe: il ne lit pas nos classes, on lui
// donne les memes couleurs et arrondis que la page.
const APPEARANCE = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: '#18181b',
    colorText: '#18181b',
    colorTextSecondary: '#71717a',
    colorDanger: '#dc2626',
    colorBackground: '#ffffff',
    borderRadius: '10px',
    fontSizeBase: '15px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
};

interface CheckoutViewProps {
  clientSecret: string;
  plan: SelfServicePlan;
  interval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
}

/**
 * Page de paiement: titre et choix de la periode, formulaire de carte, et un
 * recapitulatif a cote (en dessous du choix sur telephone).
 */
export function CheckoutView({
  clientSecret,
  plan,
  interval,
  onIntervalChange,
}: CheckoutViewProps) {
  const t = useTranslations('admin');
  const tc = useTranslations('checkout');
  const options = useMemo(
    () => ({ clientSecret, elementsOptions: { appearance: APPEARANCE } }),
    [clientSecret],
  );

  return (
    <div className="fixed inset-0 overflow-x-clip overflow-y-auto bg-zinc-50 text-zinc-900">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5 sm:px-8">
        <span className="text-lg font-semibold tracking-tight">Attabl</span>
        <Button
          variant="ghost"
          onClick={() => window.history.back()}
          className="h-11 px-3 text-sm text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
        >
          {tc('page.back')}
        </Button>
      </header>

      <CheckoutElementsProvider stripe={stripePromise} options={options}>
        <main className="mx-auto grid w-full max-w-5xl gap-8 px-5 pb-16 pt-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-14 lg:pt-10">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {tc('page.heading', { plan: PLAN_NAMES[plan] })}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              {t(`subscription.${plan}Tagline` as Parameters<typeof t>[0])}
            </p>
            <div className="mt-6">
              <CheckoutIntervalPicker plan={plan} value={interval} onChange={onIntervalChange} />
            </div>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <CheckoutSummary plan={plan} interval={interval} />
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            <CheckoutPaymentSection />
          </div>
        </main>
      </CheckoutElementsProvider>
    </div>
  );
}
