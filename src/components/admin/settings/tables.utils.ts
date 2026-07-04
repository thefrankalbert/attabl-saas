import type { Table } from './tables.types';

// Next table number for a zone = highest existing suffix + 1 (never the count,
// which drifts wrong after a deletion). Shared by the create handler and the
// naming preview so both always agree.
export function nextTableStartNumber(tables: Table[], prefix: string): number {
  const highest = tables
    .map((t) => {
      const num = parseInt(t.table_number.replace(prefix + '-', ''), 10);
      return isNaN(num) ? 0 : num;
    })
    .sort((a, b) => b - a);
  return highest.length > 0 ? highest[0] + 1 : 1;
}
