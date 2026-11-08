import { z } from 'zod';

/**
 * Details propres au type d'etablissement, stockes dans `tenants.establishment_details`
 * (jsonb). Saisis dans l'onboarding, modifiables dans Parametres > Identite.
 *
 * `.strict()`: une cle inconnue est refusee plutot qu'ecrite en silence dans la
 * colonne. Les bornes reprennent celles des selecteurs de l'onboarding.
 */
export const establishmentDetailsSchema = z
  .object({
    starRating: z.number().int().min(1).max(5).optional(),
    hasRestaurant: z.boolean().optional(),
    hasTerrace: z.boolean().optional(),
    hasWifi: z.boolean().optional(),
    hasDelivery: z.boolean().optional(),
    registerCount: z.number().int().min(1).max(100).optional(),
    totalCapacity: z.number().int().min(1).max(9999).optional(),
  })
  .strict();

export type EstablishmentDetails = z.infer<typeof establishmentDetailsSchema>;

/**
 * Lit la colonne jsonb. Une valeur stockee invalide (ecrite a la main, forme
 * ancienne) donne un objet vide plutot qu'une exception qui casserait la page.
 */
export function parseEstablishmentDetails(raw: unknown): EstablishmentDetails {
  const parsed = establishmentDetailsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/**
 * Which details belong to which establishment type (same fields as the
 * onboarding and the Settings screens). A type absent from this map has none.
 */
const DETAIL_KEYS_BY_TYPE: Record<string, ReadonlyArray<keyof EstablishmentDetails>> = {
  restaurant: ['totalCapacity'],
  hotel: ['starRating', 'hasRestaurant'],
  bar: ['hasTerrace'],
  cafe: ['hasWifi'],
  fastfood: ['registerCount', 'hasDelivery'],
};

/**
 * Keeps only the details of `type`. Switching a bar to a hotel used to keep
 * `hasTerrace` forever: invisible on screen, still stored and never cleared.
 */
export function detailsForType(
  type: string | null | undefined,
  details: EstablishmentDetails,
): EstablishmentDetails {
  const keys = DETAIL_KEYS_BY_TYPE[type ?? ''] ?? [];
  const kept: Record<string, unknown> = {};
  for (const key of keys) {
    if (details[key] !== undefined) kept[key] = details[key];
  }
  return kept as EstablishmentDetails;
}
