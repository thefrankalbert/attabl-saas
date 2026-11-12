import { describe, it, expect } from 'vitest';
import { canOpenAdminSubPath } from '../admin-route-permissions';

describe('canOpenAdminSubPath - orders', () => {
  it('hides the orders routes from a member without orders.view', () => {
    expect(canOpenAdminSubPath('/orders', { 'orders.view': false })).toBe(false);
    expect(canOpenAdminSubPath('/orders/abc', {})).toBe(false);
  });

  it('keeps the orders routes for a member with orders.view', () => {
    expect(canOpenAdminSubPath('/orders', { 'orders.view': true })).toBe(true);
  });

  it('keeps the dashboard open to every member', () => {
    expect(canOpenAdminSubPath('', {})).toBe(true);
  });
});
