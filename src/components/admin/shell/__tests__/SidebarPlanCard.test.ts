import { describe, it, expect } from 'vitest';
import { getUpsellTarget } from '../SidebarPlanCard';

describe('getUpsellTarget', () => {
  it('upsells free and starter to Pro', () => {
    expect(getUpsellTarget('GRATUIT')).toBe('pro');
    expect(getUpsellTarget('STARTER')).toBe('pro');
  });

  it('never pushes a paying Pro, Business or Enterprise tenant to the next tier', () => {
    expect(getUpsellTarget('PRO')).toBeNull();
    expect(getUpsellTarget('BUSINESS')).toBeNull();
    expect(getUpsellTarget('ENTERPRISE')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(getUpsellTarget('pro')).toBeNull();
    expect(getUpsellTarget('Business')).toBeNull();
    expect(getUpsellTarget('starter')).toBe('pro');
  });

  it('defaults unknown or empty plans to a Pro upsell', () => {
    expect(getUpsellTarget('')).toBe('pro');
    expect(getUpsellTarget('legacy')).toBe('pro');
  });
});
