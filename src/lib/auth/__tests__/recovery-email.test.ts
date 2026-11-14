import { describe, it, expect } from 'vitest';
import { recoveryEmailMatches } from '../recovery-email';

describe('recoveryEmailMatches (A-06)', () => {
  it('accepte l adresse du compte, casse et espaces ignores', () => {
    expect(recoveryEmailMatches('  Amadou@Resto.test ', 'amadou@resto.test')).toBe(true);
  });

  it('refuse une autre adresse (lien d un compte etranger)', () => {
    expect(recoveryEmailMatches('victime@resto.test', 'attaquant@evil.test')).toBe(false);
  });

  it('refuse quand le compte n a pas d adresse ou que la saisie est vide', () => {
    expect(recoveryEmailMatches('a@b.test', undefined)).toBe(false);
    expect(recoveryEmailMatches('a@b.test', null)).toBe(false);
    expect(recoveryEmailMatches('', '')).toBe(false);
  });
});
