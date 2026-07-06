import { describe, it, expect } from 'vitest';
import { getUpsellTarget } from '../SidebarPlanCard';

describe('getUpsellTarget', () => {
  it('upsells free and starter to Pro', () => {
    expect(getUpsellTarget('GRATUIT')).toBe('pro');
    expect(getUpsellTarget('STARTER')).toBe('pro');
  });

  it('upsells Pro to Business', () => {
    expect(getUpsellTarget('PRO')).toBe('business');
  });

  it('hides the card on the top plans (returns null)', () => {
    expect(getUpsellTarget('BUSINESS')).toBeNull();
    expect(getUpsellTarget('ENTERPRISE')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(getUpsellTarget('pro')).toBe('business');
    expect(getUpsellTarget('Business')).toBeNull();
    expect(getUpsellTarget('enterprise')).toBeNull();
  });

  it('defaults unknown or empty plans to a Pro upsell', () => {
    expect(getUpsellTarget('')).toBe('pro');
    expect(getUpsellTarget('legacy')).toBe('pro');
  });
});
