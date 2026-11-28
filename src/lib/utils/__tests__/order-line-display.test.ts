import { describe, it, expect } from 'vitest';
import {
  buildReorderLine,
  lineDetails,
  lineUnitTotal,
  parseLineModifiers,
} from '../order-line-display';

// Audit d'equipe du 2026-11-27 (convive C15, #48, #49): la ligne suivie
// affichait 12 000 pour un total de 12 600 et "Commander a nouveau" perdait
// taille et supplements.

describe('lignes de commande suivies', () => {
  it('compte les supplements dans le prix de la ligne (cas de l audit)', () => {
    const mods = parseLineModifiers([{ id: 'm1', name: 'Sauce piment', price: 300 }]);
    // 2 x (6 000 + 300) = 12 600, et non 12 000.
    expect(lineUnitTotal(6000, mods) * 2).toBe(12600);
  });

  it('ignore les supplements mal formes au lieu de planter', () => {
    expect(parseLineModifiers(null)).toEqual([]);
    expect(parseLineModifiers([{ price: 5 }, 'x', { name: 'Fromage', price: 'abc' }])).toEqual([
      { name: 'Fromage', price: 0 },
    ]);
  });

  it('affiche la taille, l option et les supplements sous le plat', () => {
    expect(lineDetails('Grande - Saignant', [{ name: 'Sauce piment', price: 300 }])).toEqual([
      'Grande - Saignant',
      '+ Sauce piment',
    ]);
    expect(lineDetails(null, [])).toEqual([]);
  });
});

describe('buildReorderLine', () => {
  const ligne = {
    menu_item_id: 'item-1',
    name: 'Brochettes',
    price: 6000,
    quantity: 2,
    modifiers: [{ id: 'm1', name: 'Sauce piment', price: 300 }],
    notes: 'Grande - Saignant - sans oignon',
  };
  const carte = {
    variants: [
      { id: 'v-petite', name_fr: 'Petite', name_en: null, price: 4000 },
      { id: 'v-grande', name_fr: 'Grande', name_en: 'Large', price: 6000 },
    ],
    options: [{ name_fr: 'Saignant', name_en: 'Rare' }],
  };

  it('remet la taille, l option, les supplements et la note libre', () => {
    expect(buildReorderLine(ligne, carte)).toEqual({
      id: 'item-1',
      name: 'Brochettes',
      price: 6000,
      quantity: 2,
      selectedVariant: { id: 'v-grande', name_fr: 'Grande', name_en: 'Large', price: 6000 },
      selectedOption: { name_fr: 'Saignant', name_en: 'Rare' },
      modifiers: [{ id: 'm1', name: 'Sauce piment', price: 300 }],
      customerNotes: 'sans oignon',
    });
  });

  it('prend le prix ACTUEL de la taille', () => {
    const carteAugmentee = {
      ...carte,
      variants: [{ id: 'v-grande', name_fr: 'Grande', name_en: null, price: 6500 }],
    };
    expect(buildReorderLine(ligne, carteAugmentee)?.price).toBe(6500);
  });

  it('rend null si la taille commandee n existe plus: le convive la rechoisit', () => {
    const carteSansGrande = { ...carte, variants: [carte.variants[0]] };
    expect(buildReorderLine(ligne, carteSansGrande)).toBeNull();
  });

  it('plat sans tailles: la ligne revient telle quelle (temoin)', () => {
    const simple = { ...ligne, modifiers: [], notes: 'bien cuit' };
    expect(buildReorderLine(simple, undefined)).toEqual({
      id: 'item-1',
      name: 'Brochettes',
      price: 6000,
      quantity: 2,
      customerNotes: 'bien cuit',
    });
  });
});
