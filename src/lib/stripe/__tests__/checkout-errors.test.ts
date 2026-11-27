import { describe, it, expect, afterEach, vi } from 'vitest';
import { toCheckoutApiError } from '../checkout-errors';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('toCheckoutApiError - rien de technique vers le navigateur', () => {
  for (const env of ['development', 'production']) {
    it(`variable manquante (${env}): 503 generique, sans le nom de la variable`, () => {
      vi.stubEnv('NODE_ENV', env);
      const { status, body } = toCheckoutApiError(
        new Error('Missing env var: NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY'),
      );
      expect(status).toBe(503);
      expect(body.code).toBe('STRIPE_CONFIG');
      expect(JSON.stringify(body)).not.toContain('NEXT_PUBLIC_STRIPE_PRICE');
      expect(body).not.toHaveProperty('detail');
    });

    it(`erreur inconnue (${env}): 500 generique, sans le message brut`, () => {
      vi.stubEnv('NODE_ENV', env);
      const { status, body } = toCheckoutApiError(new Error('connexion db: mot de passe invalide'));
      expect(status).toBe(500);
      expect(JSON.stringify(body)).not.toContain('mot de passe');
    });
  }

  it('temoin positif: les deux autres cas gardent leur code', () => {
    expect(toCheckoutApiError(new Error('STRIPE_SECRET_KEY absente')).body.code).toBe(
      'STRIPE_CONFIG',
    );
    expect(toCheckoutApiError(new Error('Circuit breaker open')).body.code).toBe(
      'STRIPE_UNAVAILABLE',
    );
  });
});
