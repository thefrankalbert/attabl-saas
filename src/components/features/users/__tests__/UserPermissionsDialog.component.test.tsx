// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import type { AdminUser } from '@/types/admin.types';

const toast = vi.fn();
const actionUpdateAdminUser = vi.fn();

vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/app/actions/admin', () => ({
  actionUpdateAdminUser: (...a: unknown[]) => actionUpdateAdminUser(...a),
}));
vi.mock('@/components/admin/AdminModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import UserPermissionsDialog from '../UserPermissionsDialog';

const USER = {
  id: 'u-cashier',
  role: 'cashier',
  full_name: 'Awa',
  email: 'awa@resto.test',
  custom_permissions: null,
} as unknown as AdminUser;

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <UserPermissionsDialog
        user={USER}
        tenantId="t-1"
        roleOverride={{}}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

/**
 * Verification 2026-11-24: le texte dit "enregistres automatiquement" mais le
 * testeur ne voyait aucune confirmation. Chaque enregistrement reussi doit
 * afficher un retour (toast), chaque echec un message d'erreur.
 */
describe('UserPermissionsDialog - retour d enregistrement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toast.mockReset();
    actionUpdateAdminUser.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function toggleReports() {
    const sw = screen.getByRole('switch', { name: messages.permissions.perm.reports_view });
    fireEvent.click(sw);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
  }

  it('succes: un toast de confirmation apparait', async () => {
    actionUpdateAdminUser.mockResolvedValue({ success: true });
    renderDialog();
    await toggleReports();
    expect(actionUpdateAdminUser).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ title: 'Enregistré' });
  });

  it('echec: un message d erreur, et aucune confirmation', async () => {
    actionUpdateAdminUser.mockResolvedValue({ error: 'Acces refuse' });
    renderDialog();
    await toggleReports();
    expect(toast).toHaveBeenCalledWith({ title: 'Acces refuse', variant: 'destructive' });
    expect(toast).not.toHaveBeenCalledWith({ title: 'Enregistré' });
  });
});
