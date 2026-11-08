import { describe, it, expect } from 'vitest';

import {
  mapMembershipRows,
  pickHomeTenantSlug,
  postLoginDestination,
  type PostLoginMembership,
  onboardingGateDestination,
  loginPageDestination,
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
    tenantDeletedAt: null,
    ...overrides,
  };
}

describe('postLoginDestination', () => {
  // Decision produit du 2026-11-08: un seul etablissement -> son espace,
  // plusieurs -> l'annuaire pour choisir.
  it('fait entrer le proprietaire d UN seul etablissement directement dans son espace', () => {
    expect(postLoginDestination([member({ role: 'owner' })])).toBe('/sites/chez-nous/admin');
  });

  it('envoie le proprietaire de PLUSIEURS etablissements choisir dans l annuaire', () => {
    expect(
      postLoginDestination([
        member({ role: 'owner', tenantSlug: 'a' }),
        member({ role: 'owner', tenantSlug: 'b' }),
      ]),
    ).toBe('/admin/tenants');
  });

  it('reprend l onboarding du proprietaire dont l UNIQUE etablissement est inacheve', () => {
    expect(postLoginDestination([member({ role: 'owner', onboardingCompleted: false })])).toBe(
      '/onboarding',
    );
  });

  it('ne force PLUS l onboarding quand un etablissement parmi plusieurs est inacheve', () => {
    // Avant: renvoye dans l'onboarding a CHAQUE connexion, sans acces direct a
    // ses restaurants qui tournent.
    expect(
      postLoginDestination([
        member({ role: 'owner', tenantSlug: 'tourne', onboardingCompleted: true }),
        member({ role: 'owner', tenantSlug: 'nouveau', onboardingCompleted: false }),
      ]),
    ).toBe('/admin/tenants');
  });

  it('compte un etablissement banni comme absent (un seul vivant -> son espace)', () => {
    expect(
      postLoginDestination([
        member({ role: 'owner', tenantSlug: 'vivant' }),
        member({ role: 'owner', tenantSlug: 'retire', isActive: false }),
      ]),
    ).toBe('/sites/vivant/admin');
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
    // Colonne non selectionnee: inconnu, et non "onboarding a refaire".
    expect(rows[0].onboardingCompleted).toBeNull();
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

describe('robustesse du mappage (relecture du 2026-11-06)', () => {
  it('ne renvoie PAS a l onboarding quand la colonne n a pas ete selectionnee', () => {
    // Un appelant qui omet `onboarding_completed` renverrait sinon tous ses
    // proprietaires refaire leur installation.
    const rows = mapMembershipRows([{ role: 'owner', tenants: { slug: 'le-mien' } }]);
    expect(rows[0].onboardingCompleted).toBeNull();
    expect(postLoginDestination(rows)).toBe('/sites/le-mien/admin');
  });

  it('renvoie a l onboarding seulement sur un onboarding EXPLICITEMENT inacheve', () => {
    const rows = mapMembershipRows([
      { role: 'owner', tenants: { slug: 'le-mien', onboarding_completed: false } },
    ]);
    expect(postLoginDestination(rows)).toBe('/onboarding');
  });

  it('reconnait un super admin historique porte par le role seul', () => {
    // La garde de /admin/tenants accepte `role === 'super_admin'`; les deux
    // endroits doivent en juger pareil.
    const rows = mapMembershipRows([
      { role: 'super_admin', is_super_admin: false, tenants: { slug: '__platform' } },
    ]);
    expect(postLoginDestination(rows)).toBe('/admin/platform');
  });
});

describe('etablissement supprime en douceur (audit 2026-11-08)', () => {
  it('ne l envoie PAS dans un espace supprime (boucle /login <-> espace)', () => {
    // Ses lignes admin_users restent vivantes; l'espace le renvoyait a /login,
    // qui le renvoyait dans l'espace.
    const rows = mapMembershipRows([
      {
        role: 'owner',
        is_active: true,
        tenants: { slug: 'ferme', onboarding_completed: true, deleted_at: '2026-11-01T00:00:00Z' },
      },
    ]);
    expect(postLoginDestination(rows)).toBe('/unauthorized');
  });

  it('garde l etablissement vivant quand un autre est supprime', () => {
    const rows = mapMembershipRows([
      { role: 'owner', tenants: { slug: 'vivant', onboarding_completed: true } },
      {
        role: 'owner',
        tenants: { slug: 'ferme', onboarding_completed: true, deleted_at: '2026-11-01T00:00:00Z' },
      },
    ]);
    expect(postLoginDestination(rows)).toBe('/sites/vivant/admin');
  });
});

describe('onboardingGateDestination (onboarding une seule fois)', () => {
  it('laisse passer une inscription interrompue (aucune ligne)', () => {
    expect(onboardingGateDestination([])).toBeNull();
  });

  it('laisse passer le proprietaire d un etablissement inacheve', () => {
    expect(
      onboardingGateDestination([member({ role: 'owner', onboardingCompleted: false })]),
    ).toBeNull();
  });

  it('renvoie le proprietaire d un etablissement FINI dans son espace', () => {
    expect(onboardingGateDestination([member({ role: 'owner' })])).toBe('/sites/chez-nous/admin');
  });

  it('renvoie un serveur, meme si l etablissement est inacheve', () => {
    expect(
      onboardingGateDestination([member({ role: 'waiter', onboardingCompleted: false })]),
    ).toBe('/sites/chez-nous/admin');
  });

  it('ignore un etablissement inacheve mais supprime', () => {
    expect(
      onboardingGateDestination([
        member({ role: 'owner', tenantSlug: 'vivant' }),
        member({
          role: 'owner',
          tenantSlug: 'ferme',
          onboardingCompleted: false,
          tenantDeletedAt: '2026-11-01T00:00:00Z',
        }),
      ]),
    ).toBe('/sites/vivant/admin');
  });
});

describe('loginPageDestination (/login deja connecte)', () => {
  it('fait entrer directement dans l espace', () => {
    expect(loginPageDestination([member({ role: 'owner' })])).toBe('/sites/chez-nous/admin');
  });

  it('garde le formulaire pour un compte sans acces (sinon impasse /unauthorized)', () => {
    expect(loginPageDestination([member({ isActive: false })])).toBeNull();
  });
});
