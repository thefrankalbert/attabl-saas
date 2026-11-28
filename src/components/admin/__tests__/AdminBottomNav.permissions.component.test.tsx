// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { AdminBottomNav } from '../AdminBottomNav';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { PermissionCode, Poste } from '@/types/permission.types';

// X8: la barre du bas etait une liste fixe par role, sans controle de
// permission: le caissier et le chef avaient "Analyse" (refuse), le serveur
// la caisse (alors refusee). Elle suit maintenant les permissions effectives,
// reglages du proprietaire compris.

vi.mock('next/navigation', () => ({ usePathname: () => '/sites/resto/admin' }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

function renderNav(poste: Poste, overrides: Partial<Record<PermissionCode, boolean>> = {}) {
  const levels = getEffectiveLevels({ postes: [poste], permission_overrides: overrides });
  return render(
    <PermissionsProvider postes={[poste]} levels={levels}>
      <AdminBottomNav basePath="/sites/resto/admin" />
    </PermissionsProvider>,
  );
}

function hrefOf(label: string): string | null {
  return screen.getByText(label).closest('a')?.getAttribute('href') ?? null;
}

describe('AdminBottomNav - permissions effectives', () => {
  it('caissier: pas d Analyse (aucune page ouverte)', () => {
    renderNav('cashier');
    expect(screen.queryByText('groupAnalyse')).toBeNull();
    expect(screen.getByText('navPos')).toBeInTheDocument();
  });

  it('serveur: la caisse, decision du 2026-11-09', () => {
    renderNav('waiter');
    expect(screen.getByText('navPos')).toBeInTheDocument();
  });

  it('serveur a qui le proprietaire retire la prise de commande: plus de lien', () => {
    renderNav('waiter', { 'orders.take': false });
    expect(screen.queryByText('navPos')).toBeNull();
  });

  it('chef: Analyse mene a une page qu il peut ouvrir, pas aux rapports', () => {
    renderNav('chef');
    expect(hrefOf('groupAnalyse')).toBe('/sites/resto/admin/stock-history');
  });

  it('gerant: Analyse mene aux rapports', () => {
    renderNav('manager');
    expect(hrefOf('groupAnalyse')).toBe('/sites/resto/admin/reports');
  });
});
