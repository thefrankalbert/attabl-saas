import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/permission-cases.json';
import {
  getEffectiveLevels,
  getFailClosedLevels,
  hasPermission,
  isOwner,
  meetsRequirement,
  NO_LEVELS,
  permissionLevel,
  toPermissionMap,
  toPostes,
  type PosteOverrides,
} from '../permissions';
import { BILLING_READ, MONEY_PERMISSIONS, ORDERS_ADVANCE, ORDERS_VIEW } from '../admin-roles';
import { PERMISSION_CATEGORIES } from '../permission-catalogue-ui';
import {
  PERMISSION_CODES,
  POSTE_CODES,
  POSTE_MATRIX,
  STAFF_POSTES,
  type PermissionCode,
  type PermissionMap,
  type Poste,
  type StaffPoste,
} from '@/types/permission.types';

/**
 * La resolution des droits, miroir de `public.tenant_permission_level`.
 *
 * Les attendus viennent de `tests/fixtures/permission-cases.json`, PAS de
 * `POSTE_MATRIX` : un test qui relit la matrice qu'il verifie ne prouve rien.
 * Le meme fichier est rejoue contre la base par pgTAP
 * (`supabase/tests/rls/postes_cas_partages.test.sql`), si bien que le
 * TypeScript et le SQL ne peuvent pas diverger sans qu'un des deux rougisse.
 */
type Level = 'full' | 'limited' | null;
const expectedMatrix = fixture.matrix as Record<string, Record<string, string>>;

describe('catalogue', () => {
  it('porte exactement les 22 codes de la fixture, dans le meme ordre', () => {
    expect([...PERMISSION_CODES]).toEqual(fixture.codes);
    expect(PERMISSION_CODES).toHaveLength(22);
  });

  it('porte 11 postes, dont 10 attribuables (jamais owner)', () => {
    expect(POSTE_CODES).toHaveLength(11);
    expect(STAFF_POSTES).toHaveLength(10);
    expect(STAFF_POSTES).not.toContain('owner');
    expect([...STAFF_POSTES].sort()).toEqual(Object.keys(expectedMatrix).sort());
  });

  it("chaque droit figure une seule fois dans les categories de l'ecran", () => {
    const shown = PERMISSION_CATEGORIES.flatMap((category) => category.permissions);
    expect([...shown].sort()).toEqual([...PERMISSION_CODES].sort());
  });
});

describe('matrice par defaut : les 242 cases', () => {
  // 10 postes x 22 droits = 220, plus le proprietaire (22) = 242.
  const cells = STAFF_POSTES.flatMap((poste) =>
    PERMISSION_CODES.map((code) => [poste, code, expectedMatrix[poste][code] ?? null] as const),
  );

  it('la fixture decrit 86 cases non vides (temoin : elle n est pas vide)', () => {
    expect(cells.filter(([, , level]) => level !== null)).toHaveLength(86);
  });

  it.each(cells)('%s / %s -> %s', (poste, code, level) => {
    expect(permissionLevel({ postes: [poste] }, code)).toBe(level);
  });

  it.each(PERMISSION_CODES)('proprietaire / %s -> full', (code) => {
    expect(permissionLevel({ postes: ['owner'] }, code)).toBe('full');
  });

  it('POSTE_MATRIX ne porte aucune case absente de la fixture', () => {
    for (const poste of STAFF_POSTES) {
      expect(POSTE_MATRIX[poste], poste).toEqual(expectedMatrix[poste]);
    }
  });
});

describe('cas partages avec la base (cumul, reglages, priorite)', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const level = permissionLevel(
      {
        postes: c.postes as Poste[],
        permission_overrides: c.permission_overrides as PermissionMap | null,
      },
      c.perm as PermissionCode,
      c.poste_permissions as PosteOverrides,
    );
    expect(level).toBe(c.expected as Level);
  });
});

describe('code hors catalogue : refuse pour tout le monde', () => {
  const members: [string, Poste[]][] = [
    ['proprietaire', ['owner']],
    ['gerant', ['manager']],
  ];
  const cases = fixture.unknown_codes.flatMap((code) =>
    members.map(([label, postes]) => [code, label, postes] as const),
  );

  it.each(cases)('"%s" refuse au %s', (code, _label, postes) => {
    // Un ancien code (ou une faute de frappe) ne tombe plus dans un "sinon" qui
    // accordait le droit au gerant : il est refuse, proprietaire compris.
    expect(permissionLevel({ postes }, code as PermissionCode)).toBeNull();
    expect(hasPermission({ postes }, code as PermissionCode)).toBe(false);
  });

  it('un reglage qui porte un code inconnu ne l ouvre pas', () => {
    const overrides = { 'nimporte.quoi': true } as unknown as PermissionMap;
    expect(
      permissionLevel(
        { postes: ['waiter'], permission_overrides: overrides },
        'nimporte.quoi' as PermissionCode,
      ),
    ).toBeNull();
  });

  it('temoin : un code du catalogue est bien accorde aux memes membres', () => {
    expect(permissionLevel({ postes: ['manager'] }, 'menu.edit')).toBe('full');
  });
});

describe('meetsRequirement', () => {
  const cashier = getEffectiveLevels({ postes: ['cashier'] });
  const manager = getEffectiveLevels({ postes: ['manager'] });
  const cook = getEffectiveLevels({ postes: ['cook'] });

  it('un code seul exige le droit entier : limited ne suffit pas', () => {
    expect(meetsRequirement(cashier, 'orders.pay')).toBe(true);
    expect(meetsRequirement(cashier, 'orders.refund')).toBe(false); // limited
  });

  it('un tableau exige TOUS les droits', () => {
    expect(meetsRequirement(manager, MONEY_PERMISSIONS)).toBe(true);
    expect(meetsRequirement(cashier, MONEY_PERMISSIONS)).toBe(false);
  });

  it('autorite d argent : un seul des quatre droits ne suffit pas, les quatre oui', () => {
    const one = getEffectiveLevels({
      postes: ['cashier'],
      permission_overrides: { 'orders.refund': true },
    });
    const four = getEffectiveLevels({
      postes: ['cashier'],
      permission_overrides: {
        'orders.refund': true,
        'orders.cancel': true,
        'orders.discount': true,
      },
    });
    expect(meetsRequirement(one, MONEY_PERMISSIONS)).toBe(false);
    expect(meetsRequirement(four, MONEY_PERMISSIONS)).toBe(true);
  });

  it('anyOf : au moins un droit entier', () => {
    expect(meetsRequirement(cook, ORDERS_VIEW)).toBe(true); // kitchen.track
    expect(meetsRequirement(cook, ORDERS_ADVANCE)).toBe(true);
    expect(meetsRequirement(NO_LEVELS, ORDERS_VIEW)).toBe(false);
  });

  it('atLeastLimited : le niveau borne suffit, l absence non', () => {
    expect(meetsRequirement(manager, BILLING_READ)).toBe(true); // limited
    expect(meetsRequirement(manager, 'billing.manage')).toBe(false);
    expect(meetsRequirement(cashier, BILLING_READ)).toBe(false);
  });
});

describe('echec ferme et lectures de la base', () => {
  it('lecture des reglages en panne : seuls le proprietaire et le reglage par personne decident', () => {
    const manager = getFailClosedLevels({
      postes: ['manager'],
      permission_overrides: { 'orders.pay': true, 'menu.edit': false },
    });
    expect(manager['orders.pay']).toBe('full');
    expect(manager['menu.edit']).toBeNull();
    // Un droit que seule la matrice donnait est refuse : la panne ne rend rien.
    expect(manager['settings.edit']).toBeNull();
    expect(getFailClosedLevels({ postes: ['owner'] })['settings.edit']).toBe('full');
  });

  it('toPostes ecarte tout ce qui n est pas un des 11 codes, et range dans l ordre canonique', () => {
    expect(toPostes(['waiter', 'admin', 'owner', 42, 'cashier'])).toEqual([
      'owner',
      'cashier',
      'waiter',
    ]);
    expect(toPostes(null)).toEqual([]);
    expect(toPostes('owner')).toEqual([]);
  });

  it('toPermissionMap ne garde que les codes du catalogue a valeur booleenne', () => {
    expect(
      toPermissionMap({ 'menu.edit': true, 'nimporte.quoi': true, 'orders.pay': 'oui' }),
    ).toEqual({ 'menu.edit': true });
    expect(toPermissionMap(null)).toBeNull();
    expect(toPermissionMap(['menu.edit'])).toBeNull();
  });

  it('isOwner ne regarde que le poste owner', () => {
    expect(isOwner({ postes: ['owner'] })).toBe(true);
    expect(isOwner({ postes: ['manager'] as StaffPoste[] })).toBe(false);
  });
});
