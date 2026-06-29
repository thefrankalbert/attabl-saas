/**
 * Registre central des moyens de paiement.
 *
 * Aujourd'hui: especes uniquement (`active: true`). Le mobile money et la carte
 * sont declares mais inactifs (`active: false`) - l'app reste prete a les
 * accueillir, ainsi que les pays cibles, sans rearchitecture.
 *
 * Pour activer un moyen plus tard:
 *  1. Passer son `active` a `true` ici.
 *  2. Pour le mobile money: re-ajouter le client provider (ex. `src/lib/wave/`)
 *     plus ses routes API d'initiation et de webhook. Le code de reference
 *     existe dans l'historique git (avant le commit de retrait du mobile money).
 *  3. Verifier les cles i18n `paymentMethod.<id>.label` / `.desc` (deja
 *     presentes dans `src/messages/*.json`).
 *
 * C'est l'unique source de verite: le formulaire de reglages tenant, la
 * validation de la Server Action et le defaut d'un nouveau tenant en derivent.
 */

export interface PaymentMethodMeta {
  /** Propose aux tenants et aux clients aujourd'hui. */
  active: boolean;
  /** Pays cibles (ISO-3166-1 alpha-2) pour les moyens mobile money. */
  countries?: readonly string[];
}

export const PAYMENT_METHODS = {
  cash: { active: true },
  card: { active: false },
  wave: { active: false, countries: ['SN', 'CI'] },
  orange_money: { active: false, countries: ['SN', 'CI', 'ML', 'BF', 'CM'] },
  mtn_momo: { active: false, countries: ['CI', 'CM', 'BF', 'CG'] },
  free_money: { active: false, countries: ['SN'] },
} as const satisfies Record<string, PaymentMethodMeta>;

export type PaymentMethodId = keyof typeof PAYMENT_METHODS;

/** Tous les ids connus, y compris ceux inactifs (utile pour lire des commandes historiques). */
export const ALL_PAYMENT_METHOD_IDS = Object.keys(PAYMENT_METHODS) as PaymentMethodId[];

/** Moyens actuellement proposes - especes seulement pour l'instant. */
export const ACTIVE_PAYMENT_METHOD_IDS = ALL_PAYMENT_METHOD_IDS.filter(
  (id) => PAYMENT_METHODS[id].active,
);

/** Moyens attribues par defaut a un nouveau tenant. */
export const DEFAULT_PAYMENT_METHODS: PaymentMethodId[] = [...ACTIVE_PAYMENT_METHOD_IDS];
