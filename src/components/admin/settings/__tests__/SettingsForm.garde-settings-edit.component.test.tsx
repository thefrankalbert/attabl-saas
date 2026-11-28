// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '@/components/ui/input';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { PermissionMap, Poste } from '@/types/permission.types';
import type { SettingsTenant } from '@/hooks/useSettingsData';
import { SettingsForm } from '../SettingsForm';
import { DEFAULT_REMINDER_SETTINGS } from '@/lib/validations/reminders.schema';

// /settings s'ouvre sur `settings.edit`, et le formulaire est lui-meme garde par
// ce droit. Le gerant l'a par defaut; sans lui (reglage par personne) la page
// montre "Acces refuse" au lieu d'un formulaire que le serveur refuserait. Seul
// le proprietaire voit le lien vers l'editeur de permissions.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/sites/demo/admin/settings',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/actions/tenant-settings', () => ({ actionUpdateTenantSettings: vi.fn() }));
vi.mock('@/app/actions/reminders', () => ({ actionUpdateReminderSettings: vi.fn() }));
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

function renderWith(poste: Poste, overrides: PermissionMap = {}) {
  const levels = getEffectiveLevels({ postes: [poste], permission_overrides: overrides });
  render(
    <PermissionsProvider postes={[poste]} levels={levels}>
      <SettingsForm
        tenant={{ id: 't1', slug: 'demo' } as SettingsTenant}
        initialPaymentMethods={[]}
        initialTab="identity"
        initialReminderSettings={DEFAULT_REMINDER_SETTINGS}
      />
    </PermissionsProvider>,
  );
}

describe('Parametres: garde settings.edit', () => {
  // Decision du proprietaire: seul lui regle les permissions. settings.edit
  // ouvre les champs, pas l'editeur de permissions.
  it('gerant (settings.edit par defaut): champs actifs, pas de lien permissions', () => {
    renderWith('manager');
    expect(screen.getByTestId('settings-fields')).not.toBeDisabled();
    expect(screen.getByLabelText('nom')).not.toBeDisabled();
    expect(screen.getByText('saveChanges')).toBeInTheDocument();
    expect(screen.queryByText('management.permissions')).toBeNull();
  });

  it('proprietaire: lien vers les permissions visible', () => {
    renderWith('owner');
    expect(screen.getByText('management.permissions')).toBeInTheDocument();
  });

  it('gerant a qui on retire settings.edit: acces refuse, aucun champ', () => {
    renderWith('manager', { 'settings.edit': false });
    expect(screen.getByText('accessDenied')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-fields')).toBeNull();
    expect(screen.queryByText('saveChanges')).toBeNull();
  });

  it('serveur sans settings.edit: acces refuse (temoin: meme page, autre poste)', () => {
    renderWith('waiter');
    expect(screen.getByText('accessDenied')).toBeInTheDocument();
  });

  it('serveur a qui le proprietaire donne settings.edit: champs actifs, pas de lien permissions', () => {
    renderWith('waiter', { 'settings.edit': true });
    expect(screen.getByTestId('settings-fields')).not.toBeDisabled();
    expect(screen.queryByText('management.permissions')).toBeNull();
  });
});
