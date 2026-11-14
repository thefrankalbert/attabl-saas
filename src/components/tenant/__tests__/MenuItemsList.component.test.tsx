// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';

import MenuItemsList from '@/components/tenant/client-menu-detail/MenuItemsList';
import type { MenuItem } from '@/types/admin.types';

/**
 * La carte client rend toutes les categories a la suite dans une seule liste.
 * Sans titre au debut de chaque categorie, un client lisait les plats, les
 * desserts et les boissons sous le nom de la premiere categorie: rien ne
 * marquait le passage de l'une a l'autre.
 *
 * Ce test fige deux choses: chaque categorie n'affiche QUE ses plats, et
 * chacune annonce son nom (sauf la premiere, deja annoncee par la barre
 * collante juste au-dessus - sinon le meme mot serait lu deux fois).
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// On ne teste pas la carte d'un plat ici, seulement le decoupage en sections.
vi.mock('@/components/tenant/MenuItemCard', () => ({
  default: ({ item }: { item: MenuItem }) => <div data-testid="plat">{item.name}</div>,
}));

function plat(id: string, name: string): MenuItem {
  return { id, name, price: 1000, is_available: true } as MenuItem;
}

const CATEGORIES = [
  {
    id: 'c1',
    name: 'Entrees',
    items: [plat('i1', 'Salade'), plat('i2', 'Soupe')],
  },
  { id: 'c2', name: 'Plats', items: [plat('i3', 'Poulet')] },
  { id: 'c3', name: 'Desserts', items: [plat('i4', 'Glace')] },
];

function rendre(categories: typeof CATEGORIES) {
  return render(
    <MenuItemsList
      categories={categories}
      availabilityOverride={new Map()}
      restaurantId="t1"
      currency="XOF"
      lang="fr"
      onOpenDetail={() => {}}
    />,
  );
}

function section(id: string): HTMLElement {
  const el = document.getElementById(`cat-${id}`);
  if (!el) throw new Error(`section cat-${id} absente`);
  return el;
}

describe('MenuItemsList', () => {
  it('chaque categorie n affiche que ses propres plats', () => {
    rendre(CATEGORIES);

    expect(
      within(section('c1'))
        .getAllByTestId('plat')
        .map((e) => e.textContent),
    ).toEqual(['Salade', 'Soupe']);
    expect(
      within(section('c2'))
        .getAllByTestId('plat')
        .map((e) => e.textContent),
    ).toEqual(['Poulet']);
    expect(
      within(section('c3'))
        .getAllByTestId('plat')
        .map((e) => e.textContent),
    ).toEqual(['Glace']);
  });

  it('annonce le nom de chaque categorie qui suit la premiere', () => {
    rendre(CATEGORIES);

    expect(screen.getByRole('heading', { name: 'Plats' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Desserts' })).toBeInTheDocument();
  });

  it('n annonce pas la premiere categorie, deja affichee par la barre collante', () => {
    rendre(CATEGORIES);

    expect(screen.queryByRole('heading', { name: 'Entrees' })).not.toBeInTheDocument();
  });

  it('garde un titre par categorie quel que soit l ordre d affichage', () => {
    // Ordre change dans l'admin: Desserts en premier.
    const inverse = [CATEGORIES[2], CATEGORIES[1], CATEGORIES[0]];
    rendre(inverse);

    expect(screen.queryByRole('heading', { name: 'Desserts' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plats' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entrees' })).toBeInTheDocument();
  });

  it('ignore une categorie vide, titre compris', () => {
    const avecVide = [{ id: 'c0', name: 'Vide', items: [] }, ...CATEGORIES];
    rendre(avecVide);

    expect(document.getElementById('cat-c0')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Vide' })).not.toBeInTheDocument();
    // La premiere categorie REELLEMENT rendue reste celle sans titre.
    expect(screen.queryByRole('heading', { name: 'Entrees' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plats' })).toBeInTheDocument();
  });

  it('affiche un message quand il n y a aucune categorie', () => {
    rendre([]);

    expect(screen.getByText('noMenuAvailable')).toBeInTheDocument();
    expect(screen.queryAllByTestId('plat')).toHaveLength(0);
  });
});

/**
 * Audit du 2026-11-14: le nom anglais d'une categorie, saisi par le restaurant,
 * etait charge mais jamais affiche. Un client en anglais lisait "Plats".
 */
describe('MenuItemsList - nom de categorie traduit', () => {
  const BILINGUE = [
    { id: 'c1', name: 'Entrees', name_en: 'Starters', items: [plat('i1', 'Salade')] },
    { id: 'c2', name: 'Plats', name_en: 'Mains', items: [plat('i2', 'Poulet')] },
    { id: 'c3', name: 'Desserts', items: [plat('i3', 'Glace')] },
  ];

  function rendreEn(lang: 'fr' | 'en') {
    return render(
      <MenuItemsList
        categories={BILINGUE}
        availabilityOverride={new Map()}
        restaurantId="t1"
        currency="XOF"
        lang={lang}
        onOpenDetail={() => {}}
      />,
    );
  }

  it('en anglais: le titre de section est le nom anglais', () => {
    rendreEn('en');
    expect(within(section('c2')).getByRole('heading').textContent).toBe('Mains');
  });

  it('en anglais sans nom anglais: repli sur le nom francais', () => {
    rendreEn('en');
    expect(within(section('c3')).getByRole('heading').textContent).toBe('Desserts');
  });

  it('en francais: le nom francais reste affiche', () => {
    rendreEn('fr');
    expect(within(section('c2')).getByRole('heading').textContent).toBe('Plats');
  });
});
