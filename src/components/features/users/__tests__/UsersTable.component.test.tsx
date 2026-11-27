// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import UsersTable from '../UsersTable';
import type { AdminUser, AdminRole } from '@/types/admin.types';

function member(id: string, role: AdminRole, name: string): AdminUser {
  return {
    id,
    role,
    full_name: name,
    email: `${name.toLowerCase()}@resto.test`,
    is_active: true,
  } as AdminUser;
}

const TEAM: AdminUser[] = [
  member('u-owner', 'owner', 'Patron'),
  member('u-admin', 'admin', 'Adjoint'),
  member('u-manager', 'manager', 'Gerant'),
  member('u-waiter', 'waiter', 'Serveur'),
];

function renderTable(currentUserRole: AdminRole, canManageUsers = true) {
  return render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <UsersTable
        users={TEAM}
        currentUserRole={currentUserRole}
        canManageUsers={canManageUsers}
        onToggleStatus={vi.fn()}
        onDeleteUser={vi.fn()}
        onEditUser={vi.fn()}
        onEditPermissions={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

/**
 * Verification 2026-11-24: la ligne du proprietaire proposait "Supprimer" a
 * lui-meme, alors que le serveur refuse (rang egal, canActOnUser) et que
 * retirer le dernier membre supprimerait le restaurant. Le menu suit la meme
 * regle que le serveur: rien sur un rang egal ou superieur.
 */
describe('UsersTable - actions limitees au rang', () => {
  afterEach(cleanup);

  it('le proprietaire n a pas de menu sur sa propre ligne, mais en a sur les autres', () => {
    renderTable('owner');
    // 4 lignes, 3 menus: admin, gerant, serveur. Pas le proprietaire.
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('un admin n a de menu ni sur le proprietaire, ni sur lui-meme (rang egal), ni sur un autre admin', () => {
    renderTable('admin');
    // gerant et serveur seulement
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('temoin negatif: sans droit de gestion, aucun menu nulle part', () => {
    renderTable('owner', false);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
