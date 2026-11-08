/**
 * Valeurs proposees a un restaurateur qui n'a encore rien saisi.
 *
 * Marche de lancement: Burkina Faso, donc XOF (franc CFA d'Afrique de l'Ouest).
 *
 * POURQUOI CE FICHIER. L'ecran proposait XOF, mais le serveur renvoyait au
 * chargement les DEFAUTS DE LA BASE (`tenants.currency` = 'XAF',
 * `tenants.country` = 'Cameroun'), qui ecrasaient ceux de l'ecran: un
 * restaurant de Ouagadougou se voyait preselectionner le franc CFA d'Afrique
 * centrale. Une seule source, lue des deux cotes.
 *
 * Tout reste modifiable dans le formulaire, puis dans les Parametres.
 */
export const ONBOARDING_LAUNCH_DEFAULTS = {
  country: 'Burkina Faso',
  currency: 'XOF',
} as const;
