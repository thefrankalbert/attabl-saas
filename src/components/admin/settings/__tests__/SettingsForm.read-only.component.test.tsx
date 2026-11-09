// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '@/components/ui/input';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { DEFAULT_PERMISSIONS, type PermissionCode } from '@/types/permission.types';
import type { SettingsTenant } from '@/hooks/useSettingsData';
import { SettingsForm } from '../SettingsForm';

// /settings s'ouvre sur `settings.view`. Un role a qui le proprietaire donne
// `settings.view` sans `settings.edit` voyait "Acces refuse": la page doit
// rester lisible, champs figes, sans enregistrement ni editeur de permissions.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/sites/demo/admin/settings',
}));
vi.mock('@/app/actions/tenant-settings', () => ({ actionUpdateTenantSettings: vi.fn() }));
vi.mock('@/hooks/useSettingsData', () => ({
  useSettingsData: () => ({
    form: { handleSubmit: () => () => {} },
    saving: false,
    uploading: false,
    hasUnsavedChanges: true,
  }),
}));
vi.mock('../SoundSettings', () => ({ SoundSettings: () => null }));
vi.mock('@/components/admin/PushOptIn', () => ({ PushOptIn: () => null }));
vi.mock('@/components/features/settings/SettingsIdentity', () => ({
  default: () => <Input aria-label="nom" />,
}));
vi.mock('@/components/features/settings/SettingsBranding', () => ({ default: () => null }));
vi.mock('@/components/features/settings/SettingsBilling', () => ({ default: () => null }));
vi.mock('@/components/features/settings/SettingsSecurity', () => ({ default: () => null }));
vi.mock('@/components/features/settings/SettingsContact', () => ({ default: () => null }));
vi.mock('@/components/features/settings/SettingsOpeningHours', () => ({ default: () => null }));

function renderWith(overrides: Partial<Record<PermissionCode, boolean>>) {
  const permissions = { ...DEFAULT_PERMISSIONS.manager, ...overrides } as Record<
    PermissionCode,
    boolean
  >;
  render(
    <PermissionsProvider role="manager" permissions={permissions}>
      <SettingsForm
        tenant={{ id: 't1', slug: 'demo' } as SettingsTenant}
        initialPaymentMethods={[]}
        initialTab="identity"
      />
    </PermissionsProvider>,
  );
}

describe('Parametres: lecture seule sans settings.edit', () => {
  it('settings.view seul: page lisible, champs figes, ni enregistrer ni permissions', () => {
    renderWith({ 'settings.view': true, 'settings.edit': false });
    expect(screen.queryByText('accessDenied')).toBeNull();
    expect(screen.getByTestId('settings-fields')).toBeDisabled();
    expect(screen.getByLabelText('nom')).toBeDisabled();
    expect(screen.queryByText('saveChanges')).toBeNull();
    expect(screen.queryByText('management.permissions')).toBeNull();
  });

  it('settings.edit: champs actifs, enregistrer et permissions visibles', () => {
    renderWith({ 'settings.view': true, 'settings.edit': true });
    expect(screen.getByTestId('settings-fields')).not.toBeDisabled();
    expect(screen.getByLabelText('nom')).not.toBeDisabled();
    expect(screen.getByText('saveChanges')).toBeInTheDocument();
    expect(screen.getByText('management.permissions')).toBeInTheDocument();
  });

  it('sans settings.view: acces refuse', () => {
    renderWith({ 'settings.view': false, 'settings.edit': false });
    expect(screen.getByText('accessDenied')).toBeInTheDocument();
  });
});
