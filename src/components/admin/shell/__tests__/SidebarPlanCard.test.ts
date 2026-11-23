import { describe, it, expect } from 'vitest';
import { getUpsellTarget } from '../SidebarPlanCard';

describe('getUpsellTarget', () => {
  it('upsells starter to Pro', () => {
    expect(getUpsellTarget('STARTER')).toBe('pro');
  });

  // Pendant l'essai, tout est ouvert (offre Business): la carte ne propose pas
  // de "debloquer" la cuisine et le stock, elle invite a choisir un plan.
  it('an active trial is invited to choose a plan, never to unlock Pro', () => {
    expect(getUpsellTarget('TRIAL')).toBe('choose');
    expect(getUpsellTarget('trial')).toBe('choose');
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
