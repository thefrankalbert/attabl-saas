/**
 * Configuration Flutterwave, lue dans l'environnement et nulle part ailleurs.
 *
 * LE CONTRAT: sans cles, la fonctionnalite est ETEINTE, jamais cassee. Les
 * routes repondent 503, le bouton de paiement n'est pas affiche, et rien ne leve
 * d'exception au demarrage. Stripe n'est pas touche.
 *
 * Deux valeurs sont necessaires ensemble:
 *   - FLUTTERWAVE_SECRET_KEY    : cle secrete de l'API (creer un lien, verifier).
 *   - FLUTTERWAVE_WEBHOOK_HASH  : "secret hash" saisi dans le tableau de bord
 *     Flutterwave, renvoye dans l'en-tete `verif-hash` de chaque webhook.
 * Le lien d'hebergement (Standard checkout) n'a pas besoin de cle publique.
 */

export interface FlutterwaveConfig {
  secretKey: string;
  webhookHash: string;
}

/** Devises encaissables: XOF (Burkina Faso, Cote d'Ivoire, Senegal) et XAF (Cameroun, Tchad). */
export const FLUTTERWAVE_CURRENCIES = ['XOF', 'XAF'] as const;
export type FlutterwaveCurrency = (typeof FLUTTERWAVE_CURRENCIES)[number];

export function isFlutterwaveCurrency(value: unknown): value is FlutterwaveCurrency {
  return typeof value === 'string' && (FLUTTERWAVE_CURRENCIES as readonly string[]).includes(value);
}

export function getFlutterwaveConfig(
  env: Record<string, string | undefined> = process.env,
): FlutterwaveConfig | null {
  const secretKey = env.FLUTTERWAVE_SECRET_KEY?.trim();
  const webhookHash = env.FLUTTERWAVE_WEBHOOK_HASH?.trim();
  if (!secretKey || !webhookHash) return null;
  return { secretKey, webhookHash };
}

export function isFlutterwaveConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return getFlutterwaveConfig(env) !== null;
}
