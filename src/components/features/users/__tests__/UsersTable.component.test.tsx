// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import UsersTable from '../UsersTable';
import type { AdminUser } from '@/types/admin.types';
import { getEffectiveLevels, type PosteOverrides } from '@/lib/permissions';
import type { TeamActor } from '@/lib/auth/poste-authority';
import type { Poste } from '@/types/permission.types';

function member(id: string, postes: Poste[], name: string): AdminUser {
  return {
    id,
    postes,
    full_name: name,
    email: `${name.toLowerCase()}@resto.test`,
    is_active: true,
  } as unknown as AdminUser;
}

const TEAM: AdminUser[] = [
  member('u-owner', ['owner'], 'Patron'),
  member('u-manager', ['manager'], 'Adjoint'),
  member('u-manager2', ['manager'], 'Associe'),
  member('u-waiter', ['waiter'], 'Moussa'),
  member('u-multi', ['cashier', 'chef'], 'Polyvalent'),
];

function actorOf(user: AdminUser, posteOverrides: PosteOverrides = {}): TeamActor {
  const postes = user.postes ?? [];
  return {
    id: user.id,
    isOwner: postes.includes('owner'),
    levels: getEffectiveLevels({ postes }, posteOverrides),
  };
}

function renderTable(actorId: string, canManageUsers = true, users: AdminUser[] = TEAM) {
  const actor = actorOf(TEAM.find((u) => u.id === actorId) as AdminUser);
  return render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <UsersTable
        users={users}
        actor={actor}
        posteOverrides={{}}
        canManageUsers={canManageUsers}
        onToggleStatus={vi.fn()}
        onDeleteUser={vi.fn()}
        onEditUser={vi.fn()}
        onEditPermissions={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

// Une ligne = le conteneur du nom: on compte les menus de cette ligne.
function menusOnRowOf(name: string): number {
  const row = screen.getByText(name).closest('.divide-y > div') as HTMLElement;
  return within(row).queryAllByRole('button').length;
}

/**
 * Le menu suit la meme regle que le serveur (canActOnMember): rien sur le
 * proprietaire, sur soi-meme, ni sur un membre dont les droits ne sont pas
 * STRICTEMENT inclus dans les siens (donc pas sur un autre gerant).
 */
describe('UsersTable - actions limitees par les droits', () => {
  afterEach(cleanup);

  it('le proprietaire n a pas de menu sur sa propre ligne, mais en a sur les autres', () => {
    renderTable('u-owner');
    // 5 lignes, 4 menus: pas le proprietaire.
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(menusOnRowOf('Patron')).toBe(0);
    expect(menusOnRowOf('Adjoint')).toBe(1);
  });

  it('un gerant n a de menu ni sur le proprietaire, ni sur lui-meme, ni sur un autre gerant', () => {
    renderTable('u-manager');
    expect(menusOnRowOf('Patron')).toBe(0);
    expect(menusOnRowOf('Adjoint')).toBe(0);
    expect(menusOnRowOf('Associe')).toBe(0);
  });

  it('temoin: le meme gerant a un menu sur un serveur et sur un caissier-chef', () => {
    renderTable('u-manager');
    expect(menusOnRowOf('Moussa')).toBe(1);
    expect(menusOnRowOf('Polyvalent')).toBe(1);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('temoin negatif: sans droit de gestion, aucun menu nulle part', () => {
    renderTable('u-owner', false);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('une pastille par poste pour un membre a deux postes', () => {
    renderTable('u-owner');
    const row = screen.getByText('Polyvalent').closest('.divide-y > div') as HTMLElement;
    // Les pastilles existent en version telephone et en version large.
    expect(within(row).getAllByText(messages.users.roleCashier)).toHaveLength(2);
    expect(within(row).getAllByText(messages.users.roleChef)).toHaveLength(2);
    // Temoin: un membre a un seul poste n'a pas la pastille de l'autre.
    const waiterRow = screen.getByText('Moussa').closest('.divide-y > div') as HTMLElement;
    expect(within(waiterRow).queryByText(messages.users.roleCashier)).toBeNull();
  });
});
