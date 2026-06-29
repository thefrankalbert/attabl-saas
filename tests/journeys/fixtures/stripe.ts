/**
 * Helper Stripe en MODE TEST (sk_test_ uniquement) via l'API REST.
 * Evite d'ajouter une dependance: on parle directement a api.stripe.com.
 * Sert au parcours 6 (cycle de vie abonnement avec Test Clocks).
 */
import { journeyEnv } from './env';

const STRIPE_API = 'https://api.stripe.com/v1';

function authHeader(): string {
  return 'Bearer ' + journeyEnv.stripeSecretKey;
}

async function stripePost(
  path: string,
  form: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Stripe ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/** Cree une Test Clock (horloge simulee) pour faire avancer le temps. */
export async function createTestClock(frozenTimeUnix: number): Promise<string> {
  const clock = await stripePost('/test_helpers/test_clocks', {
    frozen_time: String(frozenTimeUnix),
    name: 'attabl-journey',
  });
  return clock.id as string;
}

/** Fait avancer l'horloge de test (renouvellement, fin d'essai, echec...). */
export async function advanceTestClock(clockId: string, toUnix: number): Promise<void> {
  await stripePost(`/test_helpers/test_clocks/${clockId}/advance`, {
    frozen_time: String(toUnix),
  });
}
