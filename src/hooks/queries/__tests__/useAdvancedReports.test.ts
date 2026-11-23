import { describe, it, expect } from 'vitest';
import {
  parseComparison,
  parseDishMargins,
  parseHeatmap,
  parseLosses,
  parsePaymentMethods,
} from '../useAdvancedReports';

describe('useAdvancedReports - normalisation', () => {
  it('marges: BIGINT en chaine, cout NUMERIC, plat sans fiche', () => {
    expect(
      parseDishMargins([
        {
          item_id: 'a',
          item_name: 'Poulet',
          quantity_sold: '3',
          revenue: '15000',
          has_recipe: true,
          cost_complete: true,
          unit_cost: '1310.000',
        },
        {
          item_id: 'b',
          item_name: 'Jus',
          quantity_sold: 3,
          revenue: 3000,
          has_recipe: false,
          cost_complete: false,
          unit_cost: null,
        },
      ]),
    ).toEqual([
      {
        itemId: 'a',
        name: 'Poulet',
        quantity: 3,
        revenue: 15000,
        hasRecipe: true,
        costComplete: true,
        unitCost: 1310,
      },
      {
        itemId: 'b',
        name: 'Jus',
        quantity: 3,
        revenue: 3000,
        hasRecipe: false,
        costComplete: false,
        unitCost: null,
      },
    ]);
  });

  it('heures fortes, moyens, pertes, comparaison', () => {
    expect(
      parseHeatmap([{ day_of_week: 3, hour_of_day: 12, revenue: '16000', order_count: '2' }]),
    ).toEqual([{ day: 3, hour: 12, revenue: 16000, orders: 2 }]);
    expect(
      parsePaymentMethods([
        { method: 'cash', collected: 10000, refunded: 2000, net: 8000, payment_count: 1 },
      ]),
    ).toEqual([{ method: 'cash', collected: 10000, refunded: 2000, net: 8000, count: 1 }]);
    expect(
      parseLosses([
        {
          ingredient_id: 'i',
          ingredient_name: 'Poulet cru',
          unit: 'kg',
          quantity: '2.000',
          cost_value: '5000.000',
          movement_count: 2,
          main_reason: null,
          cost_complete: false,
        },
      ]),
    ).toEqual([
      {
        ingredientId: 'i',
        name: 'Poulet cru',
        unit: 'kg',
        quantity: 2,
        costValue: 5000,
        movements: 2,
        mainReason: null,
        costComplete: false,
      },
    ]);
    // Champ cost_complete absent: le cout est signale manquant, pas complet.
    expect(
      parseLosses([
        {
          ingredient_id: 'j',
          ingredient_name: 'Riz cru',
          unit: 'kg',
          quantity: 1,
          cost_value: 0,
          movement_count: 1,
          main_reason: 'expired',
        },
      ])[0].costComplete,
    ).toBe(false);
    expect(
      parseComparison([
        {
          period: 'previous',
          start_at: 's',
          end_at: 'e',
          revenue: 1,
          order_count: 2,
          avg_basket: 3,
          tips: 4,
        },
      ]),
    ).toEqual([
      {
        period: 'previous',
        startAt: 's',
        endAt: 'e',
        revenue: 1,
        orders: 2,
        avgBasket: 3,
        tips: 4,
      },
    ]);
  });

  it('une reponse qui n est pas un tableau donne une liste vide', () => {
    expect(parseDishMargins(null)).toEqual([]);
    expect(parseHeatmap({})).toEqual([]);
  });
});
