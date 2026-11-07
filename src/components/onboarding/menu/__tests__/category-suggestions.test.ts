import { describe, it, expect } from 'vitest';

import {
  sameCategoryName,
  suggestedCategoryKeys,
} from '@/components/onboarding/menu/category-suggestions';

/**
 * Les rubriques proposees a l'etape "carte" de l'onboarding. Elles existent
 * parce qu'une case vide poussait les restaurateurs a recopier leur carte
 * papier, donc a creer des sous-categories ("Grillades", "Jus naturels") au
 * lieu de rubriques generales.
 */

describe('suggestedCategoryKeys', () => {
  it('propose des rubriques generales a un restaurant', () => {
    expect(suggestedCategoryKeys('restaurant')).toEqual([
      'starters',
      'mains',
      'sides',
      'desserts',
      'drinks',
      'combos',
    ]);
  });

  it('adapte les rubriques au metier', () => {
    expect(suggestedCategoryKeys('bar')[0]).toBe('drinks');
    expect(suggestedCategoryKeys('cafe')).toContain('hotDrinks');
    expect(suggestedCategoryKeys('hotel')).toContain('roomService');
    expect(suggestedCategoryKeys('fastfood')).toContain('burgers');
  });

  it('ne propose RIEN hors restauration et hotellerie', () => {
    // Types historiques encore presents en base: proposer "Entrees" a une
    // pharmacie serait pire que la case vide d'avant.
    for (const type of ['retail', 'boutique', 'pharmacy', 'salon']) {
      expect(suggestedCategoryKeys(type)).toEqual([]);
    }
  });

  it('retombe sur une liste generique pour un type inconnu ou absent', () => {
    expect(suggestedCategoryKeys(undefined)).toContain('mains');
    expect(suggestedCategoryKeys('other')).toContain('mains');
  });

  it('ne propose jamais plus que le plafond de 5 categories, sauf restaurant', () => {
    // Le restaurant en a 6: une de plus que le plafond, pour laisser un choix
    // apres les cinq premieres. Les autres metiers tiennent dans le plafond.
    for (const type of ['bar', 'cafe', 'hotel', 'fastfood', 'other']) {
      expect(suggestedCategoryKeys(type).length).toBeLessThanOrEqual(5);
    }
  });
});

describe('sameCategoryName', () => {
  it('ignore la casse, les espaces de bord et les accents', () => {
    expect(sameCategoryName('Entrées', 'entrees')).toBe(true);
    expect(sameCategoryName('  Plats ', 'Plats')).toBe(true);
    expect(sameCategoryName('Boissons chaudes', 'BOISSONS CHAUDES')).toBe(true);
  });

  it('distingue deux rubriques differentes', () => {
    expect(sameCategoryName('Plats', 'Plats legers')).toBe(false);
    expect(sameCategoryName('', 'Plats')).toBe(false);
  });
});
