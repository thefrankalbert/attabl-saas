import Stripe from 'stripe';

export type CheckoutApiErrorBody = {
  error: string;
  code?: string;
  detail?: string;
};

/**
 * Maps thrown errors to a safe HTTP response body for checkout routes.
 * Includes `detail` in development to speed up local debugging.
 */
export function toCheckoutApiError(error: unknown): { status: number; body: CheckoutApiErrorBody } {
  const isDev = process.env.NODE_ENV === 'development';

  if (error instanceof Error && error.message.includes('Missing env var')) {
    return {
      status: 503,
      body: {
        error: 'Configuration Stripe incomplete sur le serveur',
        code: 'STRIPE_CONFIG',
        ...(isDev ? { detail: error.message } : {}),
      },
    };
  }

  if (error instanceof Error && error.message.includes('STRIPE_SECRET_KEY')) {
    return {
      status: 503,
      body: {
        error: 'Cle Stripe serveur manquante',
        code: 'STRIPE_CONFIG',
        ...(isDev ? { detail: error.message } : {}),
      },
    };
  }

  if (error instanceof Error && error.message.includes('Circuit breaker')) {
    return {
      status: 503,
      body: {
        error: 'Paiement temporairement indisponible. Reessayez dans quelques instants.',
        code: 'STRIPE_UNAVAILABLE',
        ...(isDev ? { detail: error.message } : {}),
      },
    };
  }

  if (error instanceof Stripe.errors.StripeError) {
    return {
      status: 502,
      body: {
        error: 'Erreur Stripe lors de la creation du paiement',
        code: error.code ?? 'STRIPE_ERROR',
        ...(isDev ? { detail: error.message } : {}),
      },
    };
  }

  return {
    status: 500,
    body: {
      error: 'Erreur serveur',
      code: 'INTERNAL',
      ...(isDev && error instanceof Error ? { detail: error.message } : {}),
    },
  };
}
