import { describe, it, expect } from 'vitest';

import {
  mapMembershipRows,
  pickHomeTenantSlug,
  postLoginDestination,
  type PostLoginMembership,
} from '../post-login-destination';
import { permissionForAdminSubPath } from '../admin-route-permissions';
import { hasPermission } from '@/lib/permissions';
import type { AdminRole, AdminUser } from '@/types/admin.types';

/**
 * Preuve de la destination apres connexion, role par role.
 *
 * Le defaut repare: la connexion envoyait TOUT compte onboarde vers
 * `/admin/tenants`, qui refuse quiconque n'est ni proprietaire ni super admin.
 * Un serveur, un cuisinier, un caissier ou un gerant invite depuis l'espace
 * admin voyait donc "Page not found" a chaque connexion.
 */

const ROLES: AdminRole[] = ['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'];

function member(overrides: Partial<PostLoginMembership> = {}): PostLoginMembership {
  return {
    role: 'waiter',
    isSuperAdmin: false,
    isActive: true,
    deletedAt: null,
    tenantSlug: 'chez-nous',
    onboardingCompleted: true,
    tenantCreatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('postLoginDestination', () => {
  it('envoie le proprietaire a l annuaire de ses etablissements', () => {
    expect(postLoginDestination([member({ role: 'owner' })])).toBe('/admin/tenants');
  });

  it('envoie tout role non proprietaire a l espace de son etablissement', () => {
    for (const role of ROLES.filter((r) => r !== 'owner')) {
      expect(postLoginDestination([member({ role })])).toBe('/sites/chez-nous/admin');
    }
  });

  it('n envoie JAMAIS un non proprietaire vers /admin/tenants', () => {
    for (const role of ROLES.filter((r) => r !== 'owner')) {
      expect(postLoginDestination([member({ role })])).not.toBe('/admin/tenants');
    }
  });

  it('envoie le super admin plateforme a la console, meme avec un role faible', () => {
    expect(postLoginDestination([member({ role: 'waiter', isSuperAdmin: true })])).toBe(
      '/admin/platform',
    );
  });

  it('fait reprendre son onboarding au proprietaire d un etablissement inacheve', () => {
    expect(postLoginDestination([member({ role: 'owner', onboardingCompleted: false })])).toBe(
      '/onboarding',
    );
  });

  it('n envoie pas a l onboarding un membre dont l etablissement est inacheve', () => {
    // L'onboarding est l'affaire du proprietaire: un serveur n'a rien a y faire.
    expect(postLoginDestination([member({ role: 'chef', onboardingCompleted: false })])).toBe(
      '/sites/chez-nous/admin',
    );
  });

  it('renvoie a l onboarding un compte sans aucun etablissement', () => {
    expect(postLoginDestination([])).toBe('/onboarding');
  });

  it('refuse un membre suspendu ou supprime au lieu de lui creer un etablissement', () => {
    expect(postLoginDestination([member({ isActive: false })])).toBe('/unauthorized');
    expect(postLoginDestination([member({ deletedAt: '2026-02-01T00:00:00Z' })])).toBe(
      '/unauthorized',
    );
  });

  it('ignore un membership mort et retient le vivant', () => {
    expect(
      postLoginDestination([
        member({ role: 'waiter', isActive: false, tenantSlug: 'ancien' }),
        member({ role: 'waiter', tenantSlug: 'actuel' }),
      ]),
    ).toBe('/sites/actuel/admin');
  });

  it('retient le plus ancien etablissement pour un membre de plusieurs', () => {
    const dest = postLoginDestination([
      member({ tenantSlug: 'recent', tenantCreatedAt: '2026-06-01T00:00:00Z' }),
      member({ tenantSlug: 'ancien', tenantCreatedAt: '2025-03-01T00:00:00Z' }),
    ]);
    expect(dest).toBe('/sites/ancien/admin');
  });

  it('privilegie l annuaire des que la personne est proprietaire quelque part', () => {
    expect(
      postLoginDestination([
        member({ role: 'waiter', tenantSlug: 'ou-je-sers' }),
        member({ role: 'owner', tenantSlug: 'le-mien' }),
      ]),
    ).toBe('/admin/tenants');
  });

  it('refuse plutot que de construire une URL cassee quand le slug manque', () => {
    expect(postLoginDestination([member({ tenantSlug: null })])).toBe('/unauthorized');
  });

  it('n elargit aucun acces: la page d arrivee est ouverte a tous les membres', () => {
    // La correction change une adresse, pas un droit. La destination d'un role
    // non proprietaire est l'accueil du tableau de bord, route ouverte a tout
    // membre; les pages gardees restent gardees (voir role-access-matrix).
    for (const role of ROLES.filter((r) => r !== 'owner')) {
      const dest = postLoginDestination([member({ role })]);
      const subPath = dest.replace(/^\/sites\/[^/]+\/admin/, '');
      const required = permissionForAdminSubPath(subPath);
      expect(required).toBeNull();
    }
  });

  it('laisse les pages d un autre role refusees apres la correction', () => {
    const principal = { role: 'waiter' as AdminRole, custom_permissions: null } as AdminUser;
    for (const gated of ['/users', '/settings', '/reports', '/inventory', '/pos']) {
      const required = permissionForAdminSubPath(gated);
      expect(required).not.toBeNull();
      expect(hasPermission(principal, required!)).toBe(false);
    }
  });
});

describe('mapMembershipRows', () => {
  it('normalise la jointure tenants, objet ou tableau', () => {
    const asObject = mapMembershipRows([
      {
        role: 'manager',
        is_active: true,
        deleted_at: null,
        is_super_admin: false,
        tenants: { slug: 'a', onboarding_completed: true, created_at: '2026-01-01T00:00:00Z' },
      },
    ]);
    const asArray = mapMembershipRows([
      {
        role: 'manager',
        is_active: true,
        deleted_at: null,
        is_super_admin: false,
        tenants: [{ slug: 'a', onboarding_completed: true, created_at: '2026-01-01T00:00:00Z' }],
      },
    ]);
    expect(asObject).toEqual(asArray);
    expect(asObject[0].tenantSlug).toBe('a');
  });

  it('traite null et undefined comme aucun membership', () => {
    expect(mapMembershipRows(null)).toEqual([]);
    expect(mapMembershipRows(undefined)).toEqual([]);
  });

  it('considere vivante une ligne dont is_active n est pas selectionne', () => {
    const rows = mapMembershipRows([{ role: 'waiter', tenants: { slug: 'a' } }]);
    expect(rows[0].isActive).toBe(true);
    expect(rows[0].onboardingCompleted).toBe(false);
  });
});

describe('pickHomeTenantSlug', () => {
  it('ne retient que les memberships vivants', () => {
    expect(
      pickHomeTenantSlug([
        member({ isActive: false, tenantSlug: 'mort', tenantCreatedAt: '2020-01-01T00:00:00Z' }),
        member({ tenantSlug: 'vivant' }),
      ]),
    ).toBe('vivant');
  });

  it('rend null quand il n y a rien a retenir', () => {
    expect(pickHomeTenantSlug([])).toBeNull();
    expect(pickHomeTenantSlug([member({ tenantSlug: null })])).toBeNull();
  });

  it('place une date manquante en dernier', () => {
    expect(
      pickHomeTenantSlug([
        member({ tenantSlug: 'sans-date', tenantCreatedAt: null }),
        member({ tenantSlug: 'date-connue', tenantCreatedAt: '2026-05-01T00:00:00Z' }),
      ]),
    ).toBe('date-connue');
  });
});
