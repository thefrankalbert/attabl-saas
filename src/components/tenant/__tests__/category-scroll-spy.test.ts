import { describe, it, expect } from 'vitest';

import { activeCategoryAt, STICKY_STACK_OFFSET } from '@/components/tenant/category-scroll-spy';

/**
 * Le titre collant de la carte client annonce une categorie. Ce test fige la
 * regle qui la choisit.
 *
 * Le defaut d'origine: la regle retenait la section dont la PLUS GRANDE PART
 * tombait dans une bande de lecture, si bien qu'une categorie en train de
 * sortir de l'ecran l'emportait sur celle qui arrivait, et le titre restait en
 * retard d'une categorie.
 */

const A = STICKY_STACK_OFFSET;

describe('activeCategoryAt', () => {
  it('annonce la premiere categorie tant qu aucune n a atteint la ligne', () => {
    // Haut de page: toutes les sections sont sous la pile collante.
    const actif = activeCategoryAt([
      { id: 'entrees', top: A + 1 },
      { id: 'plats', top: A + 700 },
    ]);
    expect(actif).toBe('entrees');
  });

  it('annonce la categorie qui occupe le haut de la zone de lecture', () => {
    expect(
      activeCategoryAt([
        { id: 'entrees', top: -500 },
        { id: 'plats', top: -10 },
        { id: 'desserts', top: A + 300 },
      ]),
    ).toBe('plats');
  });

  it('n est jamais en retard quand la categorie suivante vient de passer', () => {
    // Le haut de "desserts" vient de franchir la ligne: c'est elle, meme si la
    // categorie precedente est encore largement visible plus bas.
    expect(
      activeCategoryAt([
        { id: 'entrees', top: -2000 },
        { id: 'plats', top: -800 },
        { id: 'desserts', top: A - 2 },
      ]),
    ).toBe('desserts');
  });

  it('annonce la derniere categorie en bas de liste', () => {
    expect(
      activeCategoryAt([
        { id: 'entrees', top: -3000 },
        { id: 'plats', top: -2000 },
        { id: 'boissons', top: -200 },
      ]),
    ).toBe('boissons');
  });

  it('tolere un pixel: un defilement fractionnaire ne fait pas clignoter le titre', () => {
    expect(
      activeCategoryAt([
        { id: 'entrees', top: -10 },
        { id: 'plats', top: A + 0.6 },
      ]),
    ).toBe('plats');
  });

  it('suit l ordre d affichage, quel qu il soit', () => {
    // Memes sections, ordre inverse dans l'admin: la regle ne presume aucun nom
    // ni aucune position, seulement l'ordre du document.
    expect(
      activeCategoryAt([
        { id: 'desserts', top: -400 },
        { id: 'plats', top: A + 10 },
        { id: 'entrees', top: A + 900 },
      ]),
    ).toBe('desserts');
  });

  it('rend null quand il n y a aucune section', () => {
    expect(activeCategoryAt([])).toBeNull();
  });

  it('accepte une ligne d ancrage differente', () => {
    const sections = [
      { id: 'a', top: -100 },
      { id: 'b', top: 120 },
    ];
    expect(activeCategoryAt(sections, 50)).toBe('a');
    expect(activeCategoryAt(sections, 130)).toBe('b');
  });
});
