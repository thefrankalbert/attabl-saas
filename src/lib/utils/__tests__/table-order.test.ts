import { describe, it, expect } from 'vitest';
import { sortByTableNumber } from '../table-order';

describe('sortByTableNumber', () => {
  it('orders numbers naturally, not as text', () => {
    const rows = ['1', '10', '2', '9'].map((table_number) => ({ table_number }));
    expect(sortByTableNumber(rows).map((r) => r.table_number)).toEqual(['1', '2', '9', '10']);
  });

  it('orders prefixed numbers naturally and leaves the input untouched', () => {
    const rows = ['BAR-10', 'BAR-2', 'BAR-1'].map((table_number) => ({ table_number }));
    expect(sortByTableNumber(rows).map((r) => r.table_number)).toEqual([
      'BAR-1',
      'BAR-2',
      'BAR-10',
    ]);
    expect(rows[0].table_number).toBe('BAR-10');
  });
});
