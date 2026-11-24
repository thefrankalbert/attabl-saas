import { describe, it, expect } from 'vitest';
import {
  passwordSchema,
  missingPasswordRules,
  parsePasswordIssue,
  PASSWORD_SYMBOLS,
} from '../common.schema';

/**
 * Memes regles que la politique Auth de la production (12 caracteres,
 * minuscule, majuscule, chiffre, symbole de la liste de Supabase). Un mot de
 * passe que le site accepte et que Supabase refuse ne doit plus exister, hors
 * mots de passe pirates (HIBP), invisibles ici.
 */
describe('passwordSchema', () => {
  it.each(['Maquis-2026!', 'Riz gras chez Awa 7!', 'K7#pmw2xQ9az'])('accepts %s', (v) => {
    expect(passwordSchema.safeParse(v).success).toBe(true);
  });

  it.each([
    ['Soleil2026!', 'trop court (11)'],
    ['maquis-2026!', 'sans majuscule'],
    ['MAQUIS-2026!', 'sans minuscule'],
    ['Maquis-chez-Awa!', 'sans chiffre'],
    ['Maquis2026Awa', 'sans symbole'],
    ['abc1', 'trop court'],
  ])('rejects %s (%s)', (v) => {
    expect(passwordSchema.safeParse(v).success).toBe(false);
  });

  it('nomme TOUTES les regles manquantes en un seul code, traduit par l interface', () => {
    const r = passwordSchema.safeParse('maquis');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues).toHaveLength(1);
      expect(parsePasswordIssue(r.error.issues[0]?.message)).toEqual({
        kind: 'rules',
        missing: ['length', 'upper', 'digit', 'symbol'],
      });
    }
  });

  it('codes trop long et trop connu', () => {
    const long = passwordSchema.safeParse(`Aa1!${'x'.repeat(100)}`);
    expect(!long.success && parsePasswordIssue(long.error.issues[0]?.message)).toEqual({
      kind: 'tooLong',
    });
    expect(parsePasswordIssue('PASSWORD_TOO_COMMON')).toEqual({ kind: 'tooCommon' });
    expect(parsePasswordIssue('Email invalide')).toBeNull();
  });
});

describe('bornes de longueur alignees sur GoTrue (contre-audit 4)', () => {
  const EMOJI = String.fromCodePoint(0x1f600); // 1 caractere, 2 unites UTF-16, 4 octets

  it('longueur comptee en caracteres: 11 avec un emoji refuse, 12 accepte', () => {
    const onze = `Aa1!bcdefg${EMOJI}`; // 11 caracteres, 12 unites UTF-16
    const douze = `Aa1!bcdefgh${EMOJI}`;
    expect([...onze]).toHaveLength(11);
    expect(missingPasswordRules(onze)).toEqual(['length']);
    expect(passwordSchema.safeParse(douze).success).toBe(true);
  });

  it('72 octets acceptes, 73 refuses en PASSWORD_TOO_LONG', () => {
    const base = 'Aa1!';
    const ok = base + 'x'.repeat(72 - base.length);
    const ko = ok + 'x';
    expect(passwordSchema.safeParse(ok).success).toBe(true);
    const r = passwordSchema.safeParse(ko);
    expect(!r.success && parsePasswordIssue(r.error.issues[0]?.message)).toEqual({
      kind: 'tooLong',
    });
  });

  it('les octets comptent, pas les caracteres: 39 caracteres dont 35 accentues (74 octets) refuses', () => {
    const accents = `Aa1!${'\u00e9'.repeat(35)}`; // 39 caracteres, 74 octets
    const r = passwordSchema.safeParse(accents);
    expect(!r.success && parsePasswordIssue(r.error.issues[0]?.message)).toEqual({
      kind: 'tooLong',
    });
  });
});

describe('symboles reconnus (liste exacte de Supabase Auth)', () => {
  it('chaque symbole de la liste compte', () => {
    for (const c of PASSWORD_SYMBOLS) {
      expect(missingPasswordRules(`Maquis2026Aw${c}`)).toEqual([]);
    }
  });

  it.each([
    ['Bienvenue 2026A', 'une espace'],
    ['Bienvenue2026\u00e9A', 'une lettre accentuee'],
    ['Bienvenue2026A\u20ac', 'le symbole euro, absent de la liste'],
  ])('%s: %s ne compte pas comme symbole', (v) => {
    expect(missingPasswordRules(v)).toEqual(['symbol']);
  });

  it('la liste est celle de GoTrue, deux-points et barre oblique inverse compris', () => {
    expect(PASSWORD_SYMBOLS).toBe('!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~');
  });
});
