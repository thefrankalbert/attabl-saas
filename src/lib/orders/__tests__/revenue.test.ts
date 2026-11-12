import { describe, it, expect } from 'vitest';
import { averageLedgerTicket, ledgerValue, sumLedgerNet } from '../revenue';

describe('revenue (payments ledger)', () => {
  it('adds received rows and subtracts refunds', () => {
    expect(ledgerValue({ amount: 3500, status: 'completed' })).toBe(3500);
    expect(ledgerValue({ amount: 1000, status: 'refunded' })).toBe(-1000);
    expect(ledgerValue({})).toBe(0);
  });

  it('reproduces audit C-041: 3 500 - 1 000 + 6 500 = 9 000', () => {
    const rows = [
      { order_id: 'a', amount: 3500, status: 'completed' },
      { order_id: 'a', amount: 1000, status: 'refunded' },
      { order_id: 'b', amount: 6500, status: 'completed' },
    ];
    expect(sumLedgerNet(rows)).toBe(9000);
  });

  it('counts a deposit on an open table', () => {
    expect(sumLedgerNet([{ amount: 500, status: 'completed' }])).toBe(500);
  });

  it('counts one ticket per order, not per tender', () => {
    const rows = [
      { order_id: 'a', amount: 2000, status: 'completed' },
      { order_id: 'a', amount: 1000, status: 'completed' },
      { order_id: 'b', amount: 3000, status: 'completed' },
    ];
    expect(averageLedgerTicket(rows)).toBe(3000);
    expect(averageLedgerTicket([])).toBe(0);
  });
});
