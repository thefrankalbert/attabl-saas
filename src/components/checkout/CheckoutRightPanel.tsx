'use client';

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useMemo } from 'react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface CheckoutRightPanelProps {
  clientSecret: string;
}

export function CheckoutRightPanel({ clientSecret }: CheckoutRightPanelProps) {
  const options = useMemo(() => ({ clientSecret }), [clientSecret]);

  return (
    <div className="bg-white flex flex-col px-6 py-12 md:px-12 min-h-full">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
