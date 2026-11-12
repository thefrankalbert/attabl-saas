import { describe, it, expect } from 'vitest';
import { stepBlockingError } from '../utils/step-validation';

const base = {
  tableConfigMode: 'minimum' as const,
  tableZones: [{ name: 'Salle', prefix: 'SAL', tableCount: 10 }],
  menuItems: [{ name: 'Poulet braise', price: 3500, category: 'Plats' }],
};

describe('stepBlockingError', () => {
  it('laisse passer des donnees valides', () => {
    expect(stepBlockingError('tables', base)).toBeNull();
    expect(stepBlockingError('menu', base)).toBeNull();
  });

  it('bloque une zone sans nom (sinon les tables s appellent "-1", "-2")', () => {
    const data = { ...base, tableZones: [{ name: '   ', prefix: '', tableCount: 10 }] };
    expect(stepBlockingError('tables', data)).toBe('zoneNameRequired');
  });

  it('ne demande pas de nom de zone quand les tables sont remises a plus tard', () => {
    const data = { ...base, tableConfigMode: 'skip' as const, tableZones: [] };
    expect(stepBlockingError('tables', data)).toBeNull();
  });

  it.each([-5, Number.NaN])('bloque un plat au prix %s', (price) => {
    const data = { ...base, menuItems: [{ name: 'Riz gras', price, category: 'Plats' }] };
    expect(stepBlockingError('menu', data)).toBe('priceInvalid');
  });

  it('accepte un prix a zero et ignore une ligne vide', () => {
    const data = {
      ...base,
      menuItems: [
        { name: 'Eau', price: 0, category: 'Boissons' },
        { name: '', price: -1, category: '' },
      ],
    };
    expect(stepBlockingError('menu', data)).toBeNull();
  });

  it('ne juge une saisie que sur son propre ecran', () => {
    const data = { ...base, menuItems: [{ name: 'Riz gras', price: -5, category: 'Plats' }] };
    expect(stepBlockingError('tables', data)).toBeNull();
  });
});
