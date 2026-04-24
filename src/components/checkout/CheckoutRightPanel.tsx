'use client';

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useMemo } from 'react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface CheckoutRightPanelProps {
  clientSecret: string;
}

export function CheckoutRightPanel({ clientSecret }: CheckoutRightPanelProps) {
  const options = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: 'stripe' as const,
        variables: {
          colorBackground: '#ffffff',
          colorText: '#1c1917',
          colorPrimary: '#65a30d',
          colorDanger: '#dc2626',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif',
          borderRadius: '8px',
          spacingUnit: '4px',
        },
      },
    }),
    [clientSecret],
  );

  return (
    <div className="flex-1 bg-white min-h-screen flex flex-col justify-center px-6 py-12 md:px-12">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
