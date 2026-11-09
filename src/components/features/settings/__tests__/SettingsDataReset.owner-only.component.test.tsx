// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { DEFAULT_PERMISSIONS, type PermissionCode } from '@/types/permission.types';
import type { AdminRole } from '@/types/admin.types';
import SettingsDataReset from '../SettingsDataReset';

// La zone dangereuse efface les commandes payees et l'historique des
// paiements: reservee au proprietaire, comme /api/admin/reset.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

function renderAs(role: AdminRole) {
  const permissions = DEFAULT_PERMISSIONS[role] as Record<PermissionCode, boolean>;
  render(
    <PermissionsProvider role={role} permissions={permissions}>
      <SettingsDataReset tenantSlug="demo" />
    </PermissionsProvider>,
  );
}

describe('Zone dangereuse: proprietaire seulement', () => {
  it('le proprietaire la voit', () => {
    renderAs('owner');
    expect(screen.getByText('dangerZone')).toBeInTheDocument();
  });

  it('un admin ne la voit pas', () => {
    renderAs('admin');
    expect(screen.queryByText('dangerZone')).toBeNull();
  });
});
