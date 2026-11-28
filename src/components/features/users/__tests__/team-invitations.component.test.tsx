// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { canGrantPostes } from '@/lib/auth/poste-authority';
import { getEffectiveLevels, type MemberRights, type PosteOverrides } from '@/lib/permissions';
import { STAFF_POSTES, type StaffPoste } from '@/types/permission.types';
import type { Invitation } from '@/types/invitation.types';
import PendingInvitations from '../PendingInvitations';
import PostesPicker from '../PostesPicker';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
// Le hook tire les actions serveur: seules ses deux aides de date servent ici.
vi.mock('@/hooks/useUsersData', () => ({ timeAgo: () => '1 h', timeUntil: () => '23 h' }));

afterEach(cleanup);

const actorOf = (member: MemberRights, overrides?: PosteOverrides) => ({
  isOwner: member.postes.includes('owner'),
  levels: getEffectiveLevels(member, overrides),
});

function invitation(id: string, partial: Partial<Invitation>): Invitation {
  return {
    id,
    tenant_id: 't-1',
    email: `${id}@resto.test`,
    postes: ['waiter'],
    permission_overrides: null,
    invited_by: 'a-1',
    token: 'x',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'pending',
    created_at: new Date().toISOString(),
    accepted_at: null,
    ...partial,
  };
}

/**
 * Audit regression M3: les boutons "Renvoyer" et "Annuler" etaient rendus sur
 * chaque ligne, puis refuses par le serveur (403). Ils suivent maintenant la
 * meme regle que les deux routes (`canManageInvitationRights`).
 */
describe('PendingInvitations - boutons par ligne', () => {
  const rows = [
    invitation('serveur', { postes: ['waiter'] }),
    invitation('gerant', { postes: ['manager'] }),
    // Le proprietaire a ajoute le paiement de l'abonnement: hors de portee d'un gerant.
    invitation('gerant-plus', {
      postes: ['manager'],
      permission_overrides: { 'billing.manage': true },
    }),
  ];
  const renderFor = (member: MemberRights) =>
    render(
      <PendingInvitations
        actor={actorOf(member)}
        posteOverrides={{}}
        pendingOnly={rows}
        loadingInvitations={false}
        resendingId={null}
        cancellingId={null}
        onResend={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
  const buttonsOf = (id: string) => {
    const row = screen.getByText(`${id}@resto.test`).closest('.rounded-xl') as HTMLElement;
    return within(row).queryAllByRole('button');
  };

  it('gerant: gere l invitation d un serveur et celle d un gerant, pas celle qui le depasse', () => {
    renderFor({ postes: ['manager'] });
    expect(buttonsOf('serveur')).toHaveLength(2);
    expect(buttonsOf('gerant')).toHaveLength(2);
    expect(buttonsOf('gerant-plus')).toHaveLength(0);
  });

  it('temoin, proprietaire: les boutons sont sur chaque ligne', () => {
    renderFor({ postes: ['owner'] });
    for (const id of ['serveur', 'gerant', 'gerant-plus']) expect(buttonsOf(id)).toHaveLength(2);
  });
});

/**
 * Audit de conformite B3: le choix proposait les 10 postes a tout invitant, et
 * le serveur refusait ensuite ceux qu'il ne peut pas donner.
 */
describe('PostesPicker - seulement les postes que l acteur peut donner', () => {
  const grantableBy = (member: MemberRights, overrides?: PosteOverrides): StaffPoste[] =>
    STAFF_POSTES.filter((p) =>
      canGrantPostes(getEffectiveLevels(member, overrides), [p], overrides),
    );
  const shown = () => screen.getAllByRole('checkbox').map((c) => c.id.replace('p-', ''));
  const renderPicker = (grantable: StaffPoste[], value: StaffPoste[] = []) =>
    render(
      <>
        <span id="postes-label">Postes</span>
        <PostesPicker
          idPrefix="p"
          labelledBy="postes-label"
          value={value}
          onChange={vi.fn()}
          grantable={grantable}
        />
      </>,
    );

  it('gerant par defaut: les 10 postes (temoin)', () => {
    renderPicker(grantableBy({ postes: ['manager'] }));
    expect(shown()).toEqual([...STAFF_POSTES]);
  });

  it('gerant a qui le proprietaire a retire les prix: ni gerant ni chef', () => {
    const grantable = grantableBy({
      postes: ['manager'],
      permission_overrides: { 'menu.price': false },
    });
    renderPicker(grantable);
    expect(shown()).not.toContain('manager');
    expect(shown()).not.toContain('chef');
    expect(shown()).toContain('waiter');
  });

  it('un poste deja porte reste affiche, pour pouvoir le retirer', () => {
    renderPicker(['waiter'], ['chef']);
    expect(shown()).toEqual(['chef', 'waiter']);
    expect(screen.getByRole('checkbox', { name: /roleChef/ })).toBeChecked();
  });

  // Audit regression B5: le groupe n'avait pas de nom accessible.
  it('le groupe porte le nom de son libelle visible', () => {
    renderPicker(['waiter']);
    expect(screen.getByRole('group', { name: 'Postes' })).toBeInTheDocument();
  });
});
