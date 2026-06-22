import { describe, it, expect } from 'vitest';
import { pickOnboardingTenantIndex } from '../select-onboarding-tenant';

describe('pickOnboardingTenantIndex', () => {
  it('returns -1 for an empty list', () => {
    expect(pickOnboardingTenantIndex([])).toBe(-1);
  });

  it('returns the only candidate', () => {
    expect(
      pickOnboardingTenantIndex([{ onboardingCompleted: false, createdAt: '2026-01-01' }]),
    ).toBe(0);
  });

  it('prefers an incomplete tenant over a completed one', () => {
    const idx = pickOnboardingTenantIndex([
      { onboardingCompleted: true, createdAt: '2026-03-01' }, // newer but done
      { onboardingCompleted: false, createdAt: '2026-01-01' }, // older but in progress
    ]);
    expect(idx).toBe(1);
  });

  it('picks the most recent among several incomplete tenants', () => {
    const idx = pickOnboardingTenantIndex([
      { onboardingCompleted: false, createdAt: '2026-01-01' },
      { onboardingCompleted: false, createdAt: '2026-05-01' }, // most recent incomplete
      { onboardingCompleted: false, createdAt: '2026-03-01' },
    ]);
    expect(idx).toBe(1);
  });

  it('falls back to the most recent overall when all are completed', () => {
    const idx = pickOnboardingTenantIndex([
      { onboardingCompleted: true, createdAt: '2026-01-01' },
      { onboardingCompleted: true, createdAt: '2026-06-01' }, // most recent
      { onboardingCompleted: true, createdAt: '2026-03-01' },
    ]);
    expect(idx).toBe(1);
  });

  it('does not depend on input order (deterministic by recency)', () => {
    const a = pickOnboardingTenantIndex([
      { onboardingCompleted: false, createdAt: '2026-02-01' },
      { onboardingCompleted: false, createdAt: '2026-04-01' },
    ]);
    const b = pickOnboardingTenantIndex([
      { onboardingCompleted: false, createdAt: '2026-04-01' },
      { onboardingCompleted: false, createdAt: '2026-02-01' },
    ]);
    expect(a).toBe(1);
    expect(b).toBe(0);
  });

  it('handles null createdAt without throwing', () => {
    const idx = pickOnboardingTenantIndex([
      { onboardingCompleted: false, createdAt: null },
      { onboardingCompleted: false, createdAt: '2026-01-01' },
    ]);
    expect(idx).toBe(1);
  });
});
