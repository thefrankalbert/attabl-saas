import { describe, it, expect } from 'vitest';
import { orderDisplayLabel } from '../order-display-label';

describe('orderDisplayLabel', () => {
  it('prefers the business order number', () => {
    expect(orderDisplayLabel({ id: 'c137c885-aaaa', order_number: 'CMD-20261109-002' })).toBe(
      'CMD-20261109-002',
    );
  });

  it('falls back to the id prefix when there is no number', () => {
    expect(orderDisplayLabel({ id: 'c137c885-aaaa', order_number: undefined })).toBe('#C137C885');
  });
});
