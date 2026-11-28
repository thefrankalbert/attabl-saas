// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { Poste } from '@/types/permission.types';
import SettingsDataReset from '../SettingsDataReset';

// La zone dangereuse efface les commandes payees et l'historique des
// paiements: reservee au proprietaire, comme /api/admin/reset.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

function renderAs(poste: Poste) {
  render(
    <PermissionsProvider postes={[poste]} levels={getEffectiveLevels({ postes: [poste] })}>
      <SettingsDataReset tenantSlug="demo" />
    </PermissionsProvider>,
  );
}

describe('Zone dangereuse: proprietaire seulement', () => {
  it('le proprietaire la voit', () => {
    renderAs('owner');
    expect(screen.getByText('reset_all_title')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'resetAction' })).toHaveLength(3);
  });

  it('un gerant (tous les droits sauf la facturation) ne la voit pas', () => {
    renderAs('manager');
    expect(screen.queryByText('reset_all_title')).toBeNull();
    expect(screen.queryByRole('button', { name: 'resetAction' })).toBeNull();
  });
});
