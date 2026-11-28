import type { PermissionCode, PermissionLevel, Poste } from '@/types/permission.types';

/**
 * Regroupement des 22 droits pour l'affichage (ecran des droits par poste et
 * reglage par personne). Chaque code y figure une seule fois : un test le
 * verifie, pour qu'un droit ajoute au catalogue ne reste pas invisible.
 */
export const PERMISSION_CATEGORIES: { key: string; permissions: PermissionCode[] }[] = [
  { key: 'menu', permissions: ['menu.view', 'menu.edit', 'menu.price'] },
  {
    key: 'orders',
    permissions: [
      'orders.take',
      'kitchen.track',
      'orders.cancel',
      'orders.discount',
      'orders.refund',
    ],
  },
  { key: 'cash', permissions: ['orders.pay', 'cash.close', 'cash.count'] },
  { key: 'reports', permissions: ['reports.menu', 'reports.money', 'reports.own'] },
  { key: 'inventory', permissions: ['inventory.view', 'inventory.edit', 'suppliers.manage'] },
  { key: 'team', permissions: ['team.view', 'team.manage'] },
  { key: 'settings', permissions: ['settings.edit', 'audit.view', 'billing.manage'] },
];

/**
 * Sens du niveau borne (`limited`) de chaque droit qui peut l'etre, en cle
 * i18n sous `permissions.limited`. Affiche en texte a cote du droit. Les
 * textes disent ce qui est VRAI aujourd'hui : le code d'un responsable et la
 * limite au QR marchand arrivent au lot 3, donc `code` et `merchantQr`
 * s'affichent "bientot" ; seul `invoices` (factures) ouvre deja quelque chose.
 */
export const LIMITED_HINT_KEYS: Partial<
  Record<PermissionCode, 'code' | 'merchantQr' | 'invoices'>
> = {
  'orders.cancel': 'code',
  'orders.discount': 'code',
  'orders.refund': 'code',
  'orders.pay': 'merchantQr',
  'billing.manage': 'invoices',
};

/** Cle i18n du libelle d'un droit (`permissions.perm.<cle>`). */
export const permissionLabelKey = (perm: PermissionCode): string => perm.replace('.', '_');

/**
 * Droits du catalogue que RIEN ne consomme encore (cloture et comptage de
 * caisse, rapports de la carte, ses propres ventes : lots 2 et 3). Leur
 * interrupteur est inactif et porte la mention "a venir", pour que le
 * proprietaire ne croie pas regler quelque chose. Un test interdit qu'un code
 * de cette liste soit lu ailleurs dans `src` : le jour ou il sert, il en sort.
 */
export const COMING_SOON_PERMISSIONS: readonly PermissionCode[] = [
  'cash.close',
  'cash.count',
  'reports.menu',
  'reports.own',
];

/**
 * Droits dont l'effet d'aujourd'hui demande une phrase (`permissions.note.<cle>`).
 * Annuler et rembourser ne comptent pour l'instant qu'avec les trois autres
 * droits d'argent, et l'annulation d'une commande non reglee suit "Encaisser"
 * (decision G.b.2) : sans cette phrase, couper "Annuler" semblait retirer
 * l'annulation au caissier.
 */
export const PERMISSIONS_WITH_NOTE: readonly PermissionCode[] = [
  'orders.cancel',
  'orders.discount',
  'orders.refund',
];

/** Cle i18n du libelle d'un poste (`users.role<Poste>`) : source unique des noms de postes. */
export const posteLabelKey = (poste: Poste): string =>
  `role${poste.charAt(0).toUpperCase()}${poste.slice(1)}`;

/**
 * Reglage a ecrire quand on bascule l'interrupteur d'un droit. `base` est le
 * niveau SANS ce reglage (matrice du poste, ou cumul des postes du membre) ;
 * `current` le reglage en place. Rend `undefined` pour retirer le reglage.
 *
 * Une case bornee par defaut (`limited`) s'affiche eteinte. Decision du
 * responsable (contre-audit N4) : depuis le niveau borne, UN SEUL clic retire
 * le droit (`false`). Il ne passe jamais par le droit entier : pour retirer
 * les factures au gerant, le proprietaire ne lui donne pas un instant le
 * paiement de l'abonnement. L'ordre est donc borne, retire, entier, retire...
 * Seul "defaut" (retrait du reglage) ramene au niveau borne.
 */
export function nextOverride(
  base: PermissionLevel | null,
  current: boolean | undefined,
): boolean | undefined {
  if (base === 'limited') return current === false;
  const next = !(current ?? base === 'full');
  return next === (base === 'full') ? undefined : next;
}
