/**
 * Quelle categorie la barre de titre collante doit annoncer, a une position de
 * defilement donnee.
 *
 * POURQUOI CE FICHIER EXISTE. La carte client rend toutes les categories a la
 * suite dans une seule liste, surmontee d'un unique titre collant. Ce titre
 * etait choisi par un `IntersectionObserver` qui retenait la section dont la
 * PLUS GRANDE PART D'ELLE-MEME tombait dans une bande de lecture. Deux defauts,
 * mesures au navigateur le 2026-11-05 sur une carte de 4 categories de 5 plats:
 *
 *   - une categorie qui sort de l'ecran garde un bout dans la bande, et ce bout
 *     pese plus lourd (rapporte a sa hauteur totale) que le gros de la
 *     categorie suivante: le titre restait en retard d'une categorie ENTIERE;
 *   - la callback d'un observer ne se redeclenche qu'au franchissement d'un
 *     seuil de ratio. Avec des sections plus hautes que la bande, le ratio
 *     bouge peu, donc le titre se figeait entre deux franchissements.
 *
 * Resultat cote client: sous "Entrees" defilaient les plats, les desserts et
 * les boissons. 48% des positions de defilement affichaient un titre faux sur
 * telephone (375x812), 29% sur 1024x768.
 *
 * La regle retenue est positionnelle, donc exacte a toute position: la
 * categorie annoncee est la DERNIERE dont le haut est deja passe sous la pile
 * collante - autrement dit celle qui occupe le haut de la zone de lecture.
 */

/**
 * Hauteur de repli de la pile collante: en-tete 63 + pastilles de categories 48
 * + barre de titre ~58. Les sections portent `scroll-mt-[170px]`, qui vise la
 * meme ligne. Ne sert que si la barre de titre n'est pas (encore) dans le DOM.
 */
export const STICKY_STACK_OFFSET = 169;

/** Id de la barre de titre collante, dernier element de la pile. */
export const STICKY_TITLE_ID = 'menu-sticky-title';

/**
 * Ligne sous laquelle le contenu devient visible, mesuree plutot que supposee.
 *
 * La hauteur de la pile n'est pas constante: quand une carte a des sous-cartes,
 * une rangee d'onglets s'intercale et la pile passe de 169 a 223px. Avec la
 * constante en dur, le titre changeait ~50px trop tard dans ce cas (mesure du
 * 2026-11-05).
 */
export function stickyAnchorBottom(): number {
  const bar = typeof document === 'undefined' ? null : document.getElementById(STICKY_TITLE_ID);
  return bar ? bar.getBoundingClientRect().bottom : STICKY_STACK_OFFSET;
}

export interface CategorySectionTop {
  id: string;
  /** `getBoundingClientRect().top` de la section, en pixels. */
  top: number;
}

/**
 * Rend l'id de la categorie a annoncer, ou `null` s'il n'y a aucune section.
 *
 * Les sections sont supposees dans l'ordre du document. Tant qu'aucune n'a
 * atteint la ligne d'ancrage (haut de page), on annonce la premiere.
 */
export function activeCategoryAt(
  sections: readonly CategorySectionTop[],
  anchor: number = STICKY_STACK_OFFSET,
): string | null {
  if (sections.length === 0) return null;

  let active = sections[0].id;
  for (const section of sections) {
    // Tolerance de 1px: un `scrollTop` fractionnaire (zoom, ecran retina) peut
    // laisser le haut d'une section a 168.6 au lieu de 169 et faire clignoter
    // le titre entre deux categories.
    if (section.top <= anchor + 1) {
      active = section.id;
    } else {
      // Ordre du document: des qu'une section est sous la ligne, les suivantes
      // le sont aussi.
      break;
    }
  }
  return active;
}
