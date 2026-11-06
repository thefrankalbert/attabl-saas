import { describe, it, expect } from 'vitest';
import {
  assignTrialVariant,
  parseAbTrialFromCookieHeader,
  getAbVariantsServerSnapshot,
  getAbVariantsSnapshot,
  subscribeAbVariants,
} from '../ab-testing';

describe('assignTrialVariant', () => {
  it('returns a valid variant', () => {
    expect(['7d', '14d']).toContain(assignTrialVariant('some-uuid'));
  });

  it('is deterministic for the same ID', () => {
    const id = 'deterministic-id-123';
    expect(assignTrialVariant(id)).toBe(assignTrialVariant(id));
  });

  it('produces both variants across a sample of IDs', () => {
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(assignTrialVariant(`user-${i}`));
    }
    expect(results.has('7d')).toBe(true);
    expect(results.has('14d')).toBe(true);
  });

  it('is roughly 50/50 split', () => {
    let sevenDays = 0;
    for (let i = 0; i < 1000; i++) {
      if (assignTrialVariant(`id-${i}`) === '7d') sevenDays++;
    }
    expect(sevenDays).toBeGreaterThan(350);
    expect(sevenDays).toBeLessThan(650);
  });
});

describe('parseAbTrialFromCookieHeader', () => {
  it('returns null for empty header', () => {
    expect(parseAbTrialFromCookieHeader('')).toBeNull();
  });

  it('returns null when cookie is absent', () => {
    expect(parseAbTrialFromCookieHeader('session=abc; other=xyz')).toBeNull();
  });

  it('parses 7d as the only cookie', () => {
    expect(parseAbTrialFromCookieHeader('attabl_ab_trial=7d')).toBe('7d');
  });

  it('parses 14d as the only cookie', () => {
    expect(parseAbTrialFromCookieHeader('attabl_ab_trial=14d')).toBe('14d');
  });

  it('parses 7d from a multi-cookie header (middle)', () => {
    expect(parseAbTrialFromCookieHeader('session=abc; attabl_ab_trial=7d; other=xyz')).toBe('7d');
  });

  it('parses 14d from a multi-cookie header (last)', () => {
    expect(parseAbTrialFromCookieHeader('session=abc; attabl_ab_trial=14d')).toBe('14d');
  });

  it('handles no space after semicolon', () => {
    expect(parseAbTrialFromCookieHeader('session=abc;attabl_ab_trial=7d')).toBe('7d');
  });

  it('returns null for an unknown variant value', () => {
    expect(parseAbTrialFromCookieHeader('attabl_ab_trial=30d')).toBeNull();
  });

  it('returns null for a tampered value', () => {
    expect(parseAbTrialFromCookieHeader('attabl_ab_trial=hacked')).toBeNull();
  });

  it('does not match a cookie with the name as a prefix (first position)', () => {
    expect(parseAbTrialFromCookieHeader('x_attabl_ab_trial=7d')).toBeNull();
  });

  it('does not match a cookie with the name as a suffix after semicolon', () => {
    expect(parseAbTrialFromCookieHeader('session=abc; x_attabl_ab_trial=7d')).toBeNull();
  });

  it('handles URL-encoded value', () => {
    expect(parseAbTrialFromCookieHeader('attabl_ab_trial=7d')).toBe('7d');
  });
});

describe('getAbVariantsServerSnapshot', () => {
  it('returns the default 14d trial', () => {
    // L'experimentation `toggle` a ete retiree le 2026-11-06 en meme temps que
    // le semestriel sur la page publique des tarifs.
    expect(getAbVariantsServerSnapshot()).toEqual({ trial: '14d' });
  });

  it('returns the same object reference on every call', () => {
    // useSyncExternalStore relies on referential stability for the server snapshot
    expect(getAbVariantsServerSnapshot()).toBe(getAbVariantsServerSnapshot());
  });
});

describe('getAbVariantsSnapshot (node environment)', () => {
  it('returns SERVER_DEFAULT when document is undefined (node env)', () => {
    // In node test environment, typeof document === 'undefined' -> returns default
    const snapshot = getAbVariantsSnapshot();
    expect(snapshot).toEqual({ trial: '14d' });
  });
});

describe('subscribeAbVariants', () => {
  it('returns an unsubscribe function', () => {
    const unsubscribe = subscribeAbVariants(() => {});
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('unsubscribe can be called multiple times without throwing', () => {
    const unsubscribe = subscribeAbVariants(() => {});
    expect(() => {
      unsubscribe();
      unsubscribe();
    }).not.toThrow();
  });

  it('supports multiple concurrent listeners', () => {
    const counts = [0, 0];
    const unsub1 = subscribeAbVariants(() => {
      counts[0]++;
    });
    const unsub2 = subscribeAbVariants(() => {
      counts[1]++;
    });
    unsub1();
    unsub2();
    // No notifications fired in this test - just verifying no errors
    expect(counts).toEqual([0, 0]);
  });
});
