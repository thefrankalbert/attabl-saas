import { describe, it, expect } from 'vitest';
import { comparableRows, parseVenueRows, parseVenueTopItems, venueKey } from '../useVenueReport';

describe('useVenueReport - normalisation', () => {
  it('convertit les BIGINT (chaines ou nombres) et garde la ligne sans espace', () => {
    const rows = parseVenueRows([
      { venue_id: 'v1', venue_name: 'Terrasse', revenue: '8000', order_count: 1, avg_basket: 8000 },
      { venue_id: null, venue_name: null, revenue: 3000, order_count: '1', avg_basket: '3000' },
    ]);
    expect(rows).toEqual([
      { venueId: 'v1', venueName: 'Terrasse', revenue: 8000, orders: 1, avgBasket: 8000 },
      { venueId: null, venueName: null, revenue: 3000, orders: 1, avgBasket: 3000 },
    ]);
    expect(venueKey(rows[1])).toBe('__none__');
    expect(venueKey(rows[0])).toBe('v1');
  });

  it('une reponse qui n est pas un tableau donne une liste vide', () => {
    expect(parseVenueRows(null)).toEqual([]);
    expect(parseVenueTopItems({})).toEqual([]);
  });

  it('normalise les meilleures ventes', () => {
    expect(
      parseVenueTopItems([
        { venue_id: 'v1', item_id: 'i1', item_name: 'Jus', quantity_sold: '6', revenue: '6000' },
      ]),
    ).toEqual([{ venueId: 'v1', itemId: 'i1', name: 'Jus', quantity: 6, revenue: 6000 }]);
  });
});

describe('comparableRows', () => {
  const espace = { venueId: 'v1', venueName: 'Salle', revenue: 5000, orders: 2, avgBasket: 2500 };
  const sansEspace = { venueId: null, venueName: null, revenue: 3000, orders: 1, avgBasket: 3000 };

  it('un espace + des ventes a emporter: deux lignes a comparer', () => {
    expect(comparableRows([espace, sansEspace])).toBe(2);
  });

  it('temoin: un espace seul ne se compare a rien', () => {
    expect(comparableRows([espace])).toBe(1);
  });

  it('une ligne sans espace vide ne compte pas', () => {
    expect(comparableRows([espace, { ...sansEspace, revenue: 0, orders: 0 }])).toBe(1);
  });
});
