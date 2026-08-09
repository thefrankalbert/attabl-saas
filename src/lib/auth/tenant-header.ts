/**
 * Lecture du tenant porte par les en-tetes de requete, avec sa provenance.
 *
 * HDR-REFERER. Le middleware injectait `x-tenant-slug` a partir du `Referer`
 * pour les appels d'API venant d'une page `/sites/<slug>/` sur le domaine
 * principal. Or le `Referer` est entierement forgeable en dehors d'un
 * navigateur, et `verifyOrigin` n'exige que l'appartenance a `*.attabl.com` -
 * trivialement satisfait par `Referer: https://attabl.com/sites/<cible>/menu`.
 *
 * Ce n'etait pas exploitable: chaque route authentifiee revalide l'appartenance
 * apres avoir resolu le tenant. Le danger etait STRUCTUREL. La garantie "le slug
 * vient du serveur" etait fausse, si bien que toute route ajoutee demain qui
 * ferait confiance a `x-tenant-slug` sans requete `admin_users` serait
 * immediatement exploitable en cross-tenant par un simple `Referer` forge.
 *
 * D'ou deux en-tetes distincts, pour que la frontiere de confiance soit lisible
 * dans le code plutot que retenue de memoire:
 *
 * - `x-tenant-slug` : REELLEMENT serveur. Pose uniquement depuis le sous-domaine,
 *   le chemin `/sites/<slug>/...` ou un domaine custom resolu en base. Un client
 *   ne peut pas l'influencer, le middleware ecrasant toujours ce qu'il recoit.
 * - `x-tenant-slug-hint` : deduit du `Referer`. Utile pour savoir QUEL
 *   etablissement l'utilisateur regarde, jamais suffisant pour AUTORISER.
 *
 * Regle: une route peut se servir du hint pour orienter une resolution, jamais
 * pour accorder un acces sans requete d'appartenance derriere.
 */

export const TENANT_SLUG_HEADER = 'x-tenant-slug';
export const TENANT_SLUG_HINT_HEADER = 'x-tenant-slug-hint';

export interface TenantSlugFromHeaders {
  slug: string | null;
  /**
   * `true` quand le slug vient d'une source serveur (sous-domaine, chemin
   * `/sites/`, domaine custom). `false` quand il ne vient que du `Referer`.
   */
  trusted: boolean;
}

/** Le slug du tenant porte par la requete, et s'il est digne de confiance. */
export function readTenantSlug(headerStore: Headers): TenantSlugFromHeaders {
  const trusted = headerStore.get(TENANT_SLUG_HEADER);
  if (trusted) return { slug: trusted, trusted: true };
  return { slug: headerStore.get(TENANT_SLUG_HINT_HEADER), trusted: false };
}
