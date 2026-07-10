import { describe, it, expect } from 'vitest';
import { buildStockReport, reportToCsv } from '../inventory-report';
import type { StockStatus } from '@/types/inventory.types';

const LABELS = {
  ingredient: 'Ingredient',
  unit: 'Unite',
  stock: 'Stock',
  minAlert: 'Alerte',
  theoretical: 'Theorique',
  counted: 'Compte',
  gap: 'Ecart',
  category: 'Categorie',
  unitCost: 'Cout',
  value: 'Valeur',
  status: 'Statut',
  low: 'Bas',
  ok: 'OK',
  total: 'Total',
};

const rows: StockStatus[] = [
  {
    id: '1',
    name: 'Tomate',
    unit: 'kg',
    current_stock: 12,
    min_stock_alert: 5,
    cost_per_unit: 500,
    category: 'Legumes',
    is_active: true,
    nb_items_using: 3,
    is_low: false,
  },
  {
    id: '2',
    name: 'Huile',
    unit: 'L',
    current_stock: 2,
    min_stock_alert: 4,
    cost_per_unit: 1500,
    category: null,
    is_active: true,
    nb_items_using: 5,
    is_low: true,
  },
];

describe('buildStockReport', () => {
  it('simple model has 5 columns and one row per ingredient', () => {
    const t = buildStockReport(rows, 'simple', 'XAF', LABELS);
    expect(t.columns).toHaveLength(5);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0][0]).toBe('Tomate');
    expect(t.rows[1][4]).toBe('Bas'); // Huile is_low
  });

  it('detailed model computes a value total', () => {
    const t = buildStockReport(rows, 'detailed', 'XAF', LABELS);
    expect(t.columns).toHaveLength(8);
    expect(t.totals).toBeDefined();
    // total value = 12*500 + 2*1500 = 9000 (formatted); assert the raw amount is present
    expect(t.totals?.some((c) => c.includes('9') && c.includes('000'))).toBe(true);
  });

  it('count-sheet leaves counted + gap blank for manual entry', () => {
    const t = buildStockReport(rows, 'count-sheet', 'XAF', LABELS);
    expect(t.columns.map((c) => c.key)).toContain('counted');
    expect(t.rows[0][3]).toBe('');
    expect(t.rows[0][4]).toBe('');
  });

  it('reportToCsv includes header, rows and totals', () => {
    const t = buildStockReport(rows, 'detailed', 'XAF', LABELS);
    const csv = reportToCsv(t);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Ingredient');
    expect(lines).toHaveLength(1 + 2 + 1); // header + 2 rows + totals
  });

  it('reportToCsv neutralizes formula-prefixed cell values (CSV injection guard)', () => {
    const evil: StockStatus[] = [
      {
        id: '9',
        name: '=HYPERLINK("http://evil","x")',
        unit: 'kg',
        current_stock: 1,
        min_stock_alert: 1,
        cost_per_unit: 100,
        category: 'Legumes',
        is_active: true,
        nb_items_using: 0,
        is_low: false,
      },
    ];
    const csv = reportToCsv(buildStockReport(evil, 'simple', 'XAF', LABELS));
    // The dangerous cell is quoted AND prefixed with a single quote so Excel/Sheets
    // treat it as text, not a formula.
    expect(csv).toContain('"\'=HYPERLINK');
    expect(csv).not.toContain(',=HYPERLINK');
  });
});
