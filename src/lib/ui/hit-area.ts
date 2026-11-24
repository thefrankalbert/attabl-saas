// Zones tactiles de 44 px (regle .claude/rules/03) sans changer l'apparence.
// Un pseudo-element transparent, centre sur l'element, agrandit la zone
// sensible. Les classes sont ECRITES EN ENTIER: Tailwind v4 ne voit pas les
// classes construites dynamiquement.
//
// Si l'element est deja positionne (absolute, fixed), retirer `relative` du
// resultat: cn() garderait la derniere des deux et casserait le placement.
// Un parent `overflow-hidden` ou `overflow-x-auto` coupe le pseudo-element:
// lui laisser 4 a 8 px de marge verticale plutot que de l'ignorer.

/** Petit element dans les deux sens (icone, pastille ronde). */
export const HIT_AREA_ICON =
  "relative after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";

/** HIT_AREA_ICON pour un element deja absolute ou fixed (sans `relative`). */
export const HIT_AREA_ICON_POSITIONED =
  "after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";

/** Element large mais bas (ligne, pastille allongee, lien). */
export const HIT_AREA_ROW =
  "relative after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']";

/** Zone qui ne grandit que vers le haut, pour un element deja absolute dont le
 *  voisin interactif est juste en dessous (lien "Oublie ?" au-dessus du champ). */
export const HIT_AREA_ROW_UP_POSITIONED =
  "after:absolute after:inset-x-0 after:bottom-0 after:h-11 after:content-['']";
