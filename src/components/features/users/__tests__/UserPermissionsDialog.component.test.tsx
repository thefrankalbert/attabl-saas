// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import type { AdminUser } from '@/types/admin.types';
import type { PosteOverrides } from '@/lib/permissions';
import type { PermissionMap, Poste } from '@/types/permission.types';

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

function userWith(postes: Poste[], permission_overrides: PermissionMap | null = null) {
  return {
    id: 'u-1',
    postes,
    full_name: 'Awa',
    email: 'awa@resto.test',
    permission_overrides,
  } as unknown as AdminUser;
}

function renderDialog(
  user: AdminUser = userWith(['cashier']),
  posteOverrides: PosteOverrides = {},
) {
  return render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <UserPermissionsDialog
        user={user}
        tenantId="t-1"
        posteOverrides={posteOverrides}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

const perm = messages.permissions.perm;
const getSwitch = (name: string) => screen.getByRole('switch', { name });

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

  async function toggleTake() {
    const sw = getSwitch(perm.orders_take);
    fireEvent.click(sw);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
  }

  it('succes: un toast de confirmation apparait', async () => {
    actionUpdateAdminUser.mockResolvedValue({ success: true });
    renderDialog();
    await toggleTake();
    expect(actionUpdateAdminUser).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ title: 'Enregistré' });
  });

  it('echec: un message d erreur, et aucune confirmation', async () => {
    actionUpdateAdminUser.mockResolvedValue({ error: 'Acces refuse' });
    renderDialog();
    await toggleTake();
    expect(toast).toHaveBeenCalledWith({ title: 'Acces refuse', variant: 'destructive' });
    expect(toast).not.toHaveBeenCalledWith({ title: 'Enregistré' });
  });
});

/**
 * La base affichee vient du CUMUL des postes et des reglages du restaurant,
 * pas d'un role unique. Le texte d'un droit borne dit ce que `limited` permet.
 */
describe('UserPermissionsDialog - base affichee', () => {
  afterEach(cleanup);

  it('un caissier seul n a pas menu.edit', () => {
    renderDialog(userWith(['cashier']));
    expect(getSwitch(perm.menu_edit)).toHaveAttribute('data-state', 'unchecked');
    expect(getSwitch(perm.orders_take)).toHaveAttribute('data-state', 'checked');
  });

  it('un membre caissier ET chef cumule: il a menu.edit et orders.take', () => {
    renderDialog(userWith(['cashier', 'chef']));
    expect(getSwitch(perm.menu_edit)).toHaveAttribute('data-state', 'checked');
    expect(getSwitch(perm.orders_take)).toHaveAttribute('data-state', 'checked');
  });

  it('le reglage du restaurant pour le poste change la base', () => {
    renderDialog(userWith(['cashier']), { cashier: { 'orders.take': false } });
    expect(getSwitch(perm.orders_take)).toHaveAttribute('data-state', 'unchecked');
  });

  it('le reglage par personne l emporte sur la base', () => {
    renderDialog(userWith(['cashier'], { 'menu.edit': true }));
    expect(getSwitch(perm.menu_edit)).toHaveAttribute('data-state', 'checked');
  });

  it('un droit limited affiche son texte et reste eteint', () => {
    renderDialog(userWith(['cashier']));
    expect(getSwitch(perm.orders_refund)).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getAllByText(messages.permissions.limited.code)).toHaveLength(3);
  });

  it('le serveur: orders.pay limited affiche le QR marchand', () => {
    renderDialog(userWith(['waiter']));
    expect(getSwitch(perm.orders_pay)).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByText(messages.permissions.limited.merchantQr)).toBeInTheDocument();
  });

  it('temoin: un droit entier n affiche aucun texte de limite', () => {
    renderDialog(userWith(['manager']));
    expect(screen.queryByText(messages.permissions.limited.code)).toBeNull();
    expect(screen.queryByText(messages.permissions.limited.merchantQr)).toBeNull();
  });

  it('un reglage par personne sur un droit limited retire le texte', () => {
    // Le caissier a trois droits bornes par code (annuler, remise, rembourser).
    renderDialog(userWith(['cashier'], { 'orders.refund': true }));
    expect(getSwitch(perm.orders_refund)).toHaveAttribute('data-state', 'checked');
    expect(screen.getAllByText(messages.permissions.limited.code)).toHaveLength(2);
  });
});
