// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '@/components/ui/input';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { SettingsTenant } from '@/hooks/useSettingsData';
import { SettingsForm } from '../SettingsForm';
import { DEFAULT_REMINDER_SETTINGS } from '@/lib/validations/reminders.schema';

// A tab click must not navigate: every tab is already on the page. router.push
// re-fetched the whole settings page from the server on each click (slow on a
// weak mobile network). The URL is updated with history.pushState instead.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => '/sites/demo/admin/settings',
  useSearchParams: () => new URLSearchParams(window.location.search),
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

function renderForm() {
  render(
    <PermissionsProvider postes={['owner']} levels={getEffectiveLevels({ postes: ['owner'] })}>
      <SettingsForm
        tenant={{ id: 't1', slug: 'demo' } as SettingsTenant}
        initialPaymentMethods={[]}
        initialTab="identity"
        initialReminderSettings={DEFAULT_REMINDER_SETTINGS}
      />
    </PermissionsProvider>,
  );
}

describe('Parametres: changement d onglet sans aller-retour serveur', () => {
  it('met l adresse a jour sans navigation serveur', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    renderForm();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'tabBilling' }));
    fireEvent.click(screen.getByRole('tab', { name: 'tabBilling' }));

    expect(routerPush).not.toHaveBeenCalled();
    expect(pushState).toHaveBeenCalledWith(null, '', '/sites/demo/admin/settings?tab=billing');
    pushState.mockRestore();
  });

  it('lit l onglet actif dans l adresse', () => {
    window.history.replaceState(null, '', '/sites/demo/admin/settings?tab=hours');
    renderForm();

    expect(screen.getByRole('tab', { name: 'tabHours' })).toHaveAttribute('data-state', 'active');
    window.history.replaceState(null, '', '/');
  });
});
