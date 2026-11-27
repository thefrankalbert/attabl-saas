import { cache } from 'react';
import { getCachedTenantOrThrow } from '@/lib/cache';
import type { Tenant } from '@/types/admin.types';
import { storefrontAccessForTenant } from './lapsed-trial';
import type { StorefrontAccess } from './storefront-access';

export interface StorefrontTenant {
  /** `null`: slug inconnu ou supprime. L'appelant repond 404 lui-meme.
   * Une base indisponible LEVE au lieu de rendre `null`. */
  tenant: Tenant | null;
  access: StorefrontAccess;
}

/**
 * Le restaurant de la vitrine et ce que le convive a le droit d'en voir.
 *
 * Le layout ET chaque page qui charge la carte l'appellent: un layout qui rend
 * `StorefrontUnavailable` n'empeche pas les pages enfants d'etre rendues en
 * parallele, et leur payload RSC (la carte entiere) partait quand meme au
 * navigateur. Chaque page verifie donc elle-meme, et `cache()` deduplique la
 * lecture sur la requete.
 *
 * `slug` vient du segment `[site]` ou du header injecte par le proxy, jamais
 * d'une valeur choisie par le client.
 */
export const getStorefrontTenant = cache(async (slug: string): Promise<StorefrontTenant> => {
  // Base indisponible: l'erreur remonte a `sites/[site]/error.tsx` ("Reessayer"),
  // et non plus a un 404 "Page introuvable" (audit convive C37).
  const tenant = await getCachedTenantOrThrow(slug);
  if (!tenant) return { tenant: null, access: 'closed' };
  return { tenant, access: await storefrontAccessForTenant(tenant.id, tenant) };
});
