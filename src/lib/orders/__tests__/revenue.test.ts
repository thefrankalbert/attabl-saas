import { describe, it, expect } from 'vitest';
import { isPaidOrder, orderGross, sumPaidRevenue } from '../revenue';

describe('orders/revenue', () => {
  describe('isPaidOrder', () => {
    it('is true only for payment_status="paid"', () => {
      expect(isPaidOrder({ payment_status: 'paid' })).toBe(true);
      expect(isPaidOrder({ payment_status: 'pending' })).toBe(false);
      expect(isPaidOrder({ payment_status: 'refunded' })).toBe(false);
      expect(isPaidOrder({ payment_status: null })).toBe(false);
      expect(isPaidOrder({})).toBe(false);
    });
  });

  describe('orderGross', () => {
    it('sums total + tip, tolerating null/undefined', () => {
      expect(orderGross({ total: 1000, tip_amount: 200 })).toBe(1200);
      expect(orderGross({ total: 1000 })).toBe(1000);
      expect(orderGross({ total: null, tip_amount: null })).toBe(0);
      expect(orderGross({})).toBe(0);
    });
  });

  describe('sumPaidRevenue', () => {
    it('counts only paid orders, gross of tip', () => {
      const orders = [
        { payment_status: 'paid', total: 1000, tip_amount: 100 }, // 1100
        { payment_status: 'pending', total: 5000, tip_amount: 500 }, // excluded
        { payment_status: 'paid', total: 2000, tip_amount: 0 }, // 2000
        { payment_status: 'refunded', total: 9000, tip_amount: 0 }, // excluded
      ];
      expect(sumPaidRevenue(orders)).toBe(3100);
    });

    it('returns 0 for an empty list or all-unpaid', () => {
      expect(sumPaidRevenue([])).toBe(0);
      expect(sumPaidRevenue([{ payment_status: 'pending', total: 1000 }])).toBe(0);
    });
  });
});
