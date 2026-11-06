// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MenuStep } from '@/components/onboarding/MenuStep';
import type { OnboardingData } from '@/app/onboarding/page';

/**
 * Comportement des rubriques proposees a l'etape "carte".
 *
 * Le defaut corrige: l'etape n'offrait qu'une case vide, et le restaurateur y
 * recopiait sa carte papier - donc des sous-categories au lieu de rubriques
 * generales.
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function donnees(overrides: Partial<OnboardingData> = {}): OnboardingData {
  return {
    establishmentType: 'restaurant',
    menuItems: [],
    currency: 'XOF',
    ...overrides,
  } as OnboardingData;
}

function rendre(overrides: Partial<OnboardingData> = {}) {
  const updateData = vi.fn();
  render(<MenuStep data={donnees(overrides)} updateData={updateData} />);
  return { updateData };
}

/** Le bouton d'une rubrique proposee (le libelle est la cle i18n mockee). */
function suggestion(cle: string): HTMLElement {
  return screen.getByRole('button', { name: `categorySuggestions.${cle}` });
}

function champsDeCategorie(): HTMLInputElement[] {
  return screen
    .getAllByPlaceholderText('categoryNamePlaceholder')
    .filter((el): el is HTMLInputElement => el instanceof HTMLInputElement);
}

describe('MenuStep - rubriques proposees', () => {
  it('propose des rubriques generales des l arrivee sur l etape', () => {
    rendre();

    expect(screen.getByText('categorySuggestionsLabel')).toBeInTheDocument();
    expect(suggestion('starters')).toBeInTheDocument();
    expect(suggestion('mains')).toBeInTheDocument();
    expect(suggestion('drinks')).toBeInTheDocument();
  });

  it('nomme la categorie vide de depart au lieu d en ajouter une deuxieme', () => {
    rendre();
    expect(champsDeCategorie()).toHaveLength(1);

    fireEvent.click(suggestion('starters'));

    const champs = champsDeCategorie();
    expect(champs).toHaveLength(1);
    expect(champs[0].value).toBe('categorySuggestions.starters');
  });

  it('ajoute une categorie a partir du deuxieme appui', () => {
    rendre();

    fireEvent.click(suggestion('starters'));
    fireEvent.click(suggestion('mains'));

    expect(champsDeCategorie().map((c) => c.value)).toEqual([
      'categorySuggestions.starters',
      'categorySuggestions.mains',
    ]);
  });

  it('retire une rubrique deja utilisee de la liste des propositions', () => {
    rendre();

    fireEvent.click(suggestion('starters'));

    expect(
      screen.queryByRole('button', { name: 'categorySuggestions.starters' }),
    ).not.toBeInTheDocument();
    expect(suggestion('mains')).toBeInTheDocument();
  });

  it('remonte les categories au parent pour l enregistrement', () => {
    const { updateData } = rendre();

    fireEvent.click(suggestion('starters'));

    // Une rubrique sans article n'a rien a enregistrer: la remontee ne porte
    // que les articles saisis. On verifie donc que le parent est notifie.
    expect(updateData).toHaveBeenCalled();
  });

  it('ne propose rien a un metier hors restauration', () => {
    rendre({ establishmentType: 'pharmacy' });

    expect(screen.queryByText('categorySuggestionsLabel')).not.toBeInTheDocument();
  });

  it('cesse de proposer quand les 5 categories sont atteintes', () => {
    rendre();

    for (const cle of ['starters', 'mains', 'sides', 'desserts', 'drinks']) {
      fireEvent.click(suggestion(cle));
    }

    expect(champsDeCategorie()).toHaveLength(5);
    expect(screen.queryByText('categorySuggestionsLabel')).not.toBeInTheDocument();
    expect(screen.getByText('maxCategories')).toBeInTheDocument();
  });

  it('ne repropose pas une rubrique deja saisie a la main', () => {
    rendre();

    fireEvent.change(champsDeCategorie()[0], {
      target: { value: '  categorySuggestions.STARTERS ' },
    });

    expect(
      screen.queryByRole('button', { name: 'categorySuggestions.starters' }),
    ).not.toBeInTheDocument();
  });
});
