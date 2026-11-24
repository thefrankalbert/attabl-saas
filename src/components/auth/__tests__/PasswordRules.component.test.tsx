// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr-FR.json';
import en from '@/messages/en-US.json';
import { passwordSchema } from '@/lib/validations/common.schema';
import { PasswordRulesList, PasswordStrengthLine, usePasswordIssueText } from '../PasswordRules';

/**
 * Contre-audit 3 et verification visuelle du lot B2b-3b: les messages du mot
 * de passe sont traduits (fr-FR et en-US), et TOUTES les regles manquantes sont
 * annoncees, pas seulement la premiere.
 */
function wrapperFor(locale: 'fr-FR' | 'en-US') {
  const messages = locale === 'fr-FR' ? fr : en;
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    );
  };
}

function issueOf(password: string): string | undefined {
  const r = passwordSchema.safeParse(password);
  return r.success ? undefined : r.error.issues[0]?.message;
}

describe('usePasswordIssueText', () => {
  it('fr-FR: nomme toutes les regles manquantes en une phrase', () => {
    const { result } = renderHook(() => usePasswordIssueText(), { wrapper: wrapperFor('fr-FR') });
    expect(result.current(issueOf('maquis'))).toBe(
      'Il manque : 12 caractères, une majuscule, un chiffre, un symbole (! ? # @).',
    );
  });

  it('en-US: meme message en anglais, aucun texte francais', () => {
    const { result } = renderHook(() => usePasswordIssueText(), { wrapper: wrapperFor('en-US') });
    expect(result.current(issueOf('Maquis2026Awa'))).toBe('Still missing: a symbol (! ? # @).');
    expect(result.current('PASSWORD_TOO_COMMON')).toBe(
      'This password is too common. Choose another one.',
    );
  });

  it('temoin: un message qui n est pas un code de mot de passe rend null', () => {
    const { result } = renderHook(() => usePasswordIssueText(), { wrapper: wrapperFor('fr-FR') });
    expect(result.current('Email invalide')).toBeNull();
  });
});

describe('PasswordRulesList', () => {
  it('coche les regles respectees, laisse les autres en attente', () => {
    render(<PasswordRulesList password="maquis 2026" />, { wrapper: wrapperFor('fr-FR') });
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      '- 12 caractères (manquante)',
      '+ une minuscule (respectée)',
      '- une majuscule (manquante)',
      '+ un chiffre (respectée)',
      // Une espace n'est pas un symbole pour Supabase.
      '- un symbole (! ? # @) (manquante)',
    ]);
  });

  it('en-US: les regles sont en anglais', () => {
    render(<PasswordRulesList password="" />, { wrapper: wrapperFor('en-US') });
    expect(screen.getByRole('list', { name: 'Password rules' })).toBeInTheDocument();
    expect(screen.getByText(/an uppercase letter/)).toBeInTheDocument();
  });
});

describe('PasswordStrengthLine (contre-audit 5)', () => {
  const tooLong = `Aa1!${'x'.repeat(69)}`; // 73 octets

  it('73 octets: annonce la limite des 72, jamais "solide"', () => {
    render(<PasswordStrengthLine id="r" password={tooLong} />, { wrapper: wrapperFor('fr-FR') });
    const line = document.getElementById('r');
    expect(line).toHaveTextContent('Trop long : 72 caractères au plus');
    expect(line).not.toHaveTextContent('solide');
  });

  it('temoin: 72 octets conformes, la ligne dit "solide"', () => {
    render(<PasswordStrengthLine id="r" password={tooLong.slice(0, 72)} />, {
      wrapper: wrapperFor('fr-FR'),
    });
    expect(document.getElementById('r')).toHaveTextContent('Mot de passe solide');
  });

  it('accord au singulier pour les lecteurs d ecran, fr-FR et en-US', () => {
    render(<PasswordStrengthLine id="fr" password="a" />, { wrapper: wrapperFor('fr-FR') });
    expect(document.getElementById('fr')).toHaveTextContent('(1 règle respectée sur 5)');
    render(<PasswordStrengthLine id="en" password="ab" />, { wrapper: wrapperFor('en-US') });
    expect(document.getElementById('en')).toHaveTextContent('(1 rule met out of 5)');
  });

  it('la liste complete annonce aussi la limite', () => {
    render(<PasswordRulesList password={tooLong} />, { wrapper: wrapperFor('en-US') });
    expect(screen.getByText(/72 characters at most/)).toBeInTheDocument();
  });
});
