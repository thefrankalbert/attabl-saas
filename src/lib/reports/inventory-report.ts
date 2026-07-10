import type { StockStatus } from '@/types/inventory.types';
import { formatCurrency } from '@/lib/utils/currency';
import { csvCell } from '@/lib/utils/csv';
import type { CurrencyCode } from '@/types/admin.types';

/**
 * Pure shaping of inventory data into a printable report table (columns + string
 * rows). Framework-free so it is unit tested and reused by the on-screen sheet,
 * print, and CSV export.
 */

export type StockReportModel = 'simple' | 'detailed' | 'count-sheet';

export interface ReportColumn {
  key: string;
  label: string;
  align: 'left' | 'right';
}

export interface ReportTable {
  columns: ReportColumn[];
  rows: string[][];
  // Totals row cells aligned to columns (empty string where no total).
  totals?: string[];
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * @param labels caller-provided i18n column labels (keeps this file locale-free)
 */
export function buildStockReport(
  rows: StockStatus[],
  model: StockReportModel,
  currency: CurrencyCode,
  labels: Record<string, string>,
): ReportTable {
  const money = (value: number) => formatCurrency(value, currency);

  if (model === 'count-sheet') {
    return {
      columns: [
        { key: 'name', label: labels.ingredient, align: 'left' },
        { key: 'unit', label: labels.unit, align: 'left' },
        { key: 'theoretical', label: labels.theoretical, align: 'right' },
        { key: 'counted', label: labels.counted, align: 'right' },
        { key: 'gap', label: labels.gap, align: 'right' },
      ],
      rows: rows.map((r) => [r.name, r.unit, fmtQty(r.current_stock), '', '']),
    };
  }

  if (model === 'detailed') {
    let totalValue = 0;
    const body = rows.map((r) => {
      const value = r.current_stock * r.cost_per_unit;
      totalValue += value;
      return [
        r.name,
        r.category ?? '-',
        r.unit,
        fmtQty(r.current_stock),
        fmtQty(r.min_stock_alert),
        money(r.cost_per_unit),
        money(value),
        r.is_low ? labels.low : labels.ok,
      ];
    });
    return {
      columns: [
        { key: 'name', label: labels.ingredient, align: 'left' },
        { key: 'category', label: labels.category, align: 'left' },
        { key: 'unit', label: labels.unit, align: 'left' },
        { key: 'stock', label: labels.stock, align: 'right' },
        { key: 'min', label: labels.minAlert, align: 'right' },
        { key: 'cost', label: labels.unitCost, align: 'right' },
        { key: 'value', label: labels.value, align: 'right' },
        { key: 'status', label: labels.status, align: 'left' },
      ],
      rows: body,
      totals: ['', '', '', '', '', labels.total, money(totalValue), ''],
    };
  }

  // simple
  return {
    columns: [
      { key: 'name', label: labels.ingredient, align: 'left' },
      { key: 'unit', label: labels.unit, align: 'left' },
      { key: 'stock', label: labels.stock, align: 'right' },
      { key: 'min', label: labels.minAlert, align: 'right' },
      { key: 'status', label: labels.status, align: 'left' },
    ],
    rows: rows.map((r) => [
      r.name,
      r.unit,
      fmtQty(r.current_stock),
      fmtQty(r.min_stock_alert),
      r.is_low ? labels.low : labels.ok,
    ]),
  };
}

/**
 * Serialize a report table to CSV (header + rows). Cells route through csvCell,
 * which escapes quotes AND neutralizes leading formula chars (= + - @ tab CR) so
 * a staff-entered ingredient/category name like "=HYPERLINK(...)" cannot execute
 * as a formula when the export is opened in Excel/Sheets.
 */
export function reportToCsv(table: ReportTable): string {
  const lines = [table.columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of table.rows) lines.push(row.map((cell) => csvCell(cell)).join(','));
  if (table.totals) lines.push(table.totals.map((cell) => csvCell(cell)).join(','));
  return lines.join('\n');
}
