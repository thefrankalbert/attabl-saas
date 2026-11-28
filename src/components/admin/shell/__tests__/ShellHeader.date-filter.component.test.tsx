// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

// Audit d'equipe du 2026-11-27 (dashboard N2): le selecteur de periode etait
// affiche sur toutes les pages admin, mais n'agissait que sur le tableau de bord.

const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }));
vi.mock('../../topbar/TopbarSearch', () => ({ TopbarSearch: () => null }));
vi.mock('../HeaderDateFilter', () => ({ HeaderDateFilter: () => <div>selecteur-periode</div> }));

import { ShellHeader } from '../ShellHeader';

function renderAt(pathname: string): void {
  nav.pathname = pathname;
  render(<ShellHeader onToggleSidebar={vi.fn()} isDark={false} onToggleTheme={vi.fn()} />);
}

describe('ShellHeader: selecteur de periode', () => {
  it.each(['/sites/resto/admin', '/sites/resto/admin/', '/admin'])('affiche sur %s', (p) => {
    renderAt(p);
    expect(screen.getByText('selecteur-periode')).toBeInTheDocument();
  });

  it.each(['/sites/resto/admin/categories', '/admin/orders'])('absent sur %s', (p) => {
    renderAt(p);
    expect(screen.queryByText('selecteur-periode')).not.toBeInTheDocument();
  });
});
