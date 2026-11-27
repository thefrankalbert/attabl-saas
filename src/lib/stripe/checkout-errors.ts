import Stripe from 'stripe';

export type CheckoutApiErrorBody = {
  error: string;
  code?: string;
};

/**
 * Maps thrown errors to a safe HTTP response body for checkout routes.
 * Le message brut de l'erreur ne quitte JAMAIS le serveur (nom d'une variable
 * d'environnement manquante, texte Stripe, etc.): la route le journalise avec
 * logger.error, le navigateur ne recoit qu'un message generique et un code.
 */
export function toCheckoutApiError(error: unknown): { status: number; body: CheckoutApiErrorBody } {
  if (error instanceof Error && error.message.includes('Missing env var')) {
    return {
      status: 503,
      body: {
        error: 'Configuration Stripe incomplete sur le serveur',
        code: 'STRIPE_CONFIG',
      },
    };
  }

  if (error instanceof Error && error.message.includes('STRIPE_SECRET_KEY')) {
    return {
      status: 503,
      body: {
        error: 'Cle Stripe serveur manquante',
        code: 'STRIPE_CONFIG',
      },
    };
  }

  if (error instanceof Error && error.message.includes('Circuit breaker')) {
    return {
      status: 503,
      body: {
        error: 'Paiement temporairement indisponible. Reessayez dans quelques instants.',
        code: 'STRIPE_UNAVAILABLE',
      },
    };
  }

  if (error instanceof Stripe.errors.StripeError) {
    return {
      status: 502,
      body: {
        error: 'Erreur Stripe lors de la creation du paiement',
        code: error.code ?? 'STRIPE_ERROR',
      },
    };
  }

  return {
    status: 500,
    body: {
      error: 'Erreur serveur',
      code: 'INTERNAL',
    },
  };
}
