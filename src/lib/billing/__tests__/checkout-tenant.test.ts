import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pourquoi ces tests. La resolution prenait la PLUS ANCIENNE ligne
 * `admin_users` de l'utilisateur, sans jamais regarder quel restaurant il
 * consultait: un proprietaire de plusieurs etablissements ne pouvait abonner
 * que le premier, et le paiement partait sur le mauvais restaurant.
 *
 * Deux proprietes a figer:
 *   1. avec une cible, c'est CETTE cible qui est facturee - apres verification
 *      d'appartenance et de role (sinon ce serait une IDOR: la lecture se fait
 *      avec le client service_role, le RLS ne protege rien ici);
 *   2. sans cible et avec plusieurs restaurants, on REFUSE au lieu d'en
 *      choisir un en silence.
 */

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

type LigneMembre = {
  postes: string[];
  permission_overrides?: Record<string, boolean> | null;
  tenant_id: string;
  tenants: {
    name: string;
    subscription_status?: string | null;
    suspended_at?: string | null;
    deleted_at?: string | null;
  } | null;
};

/** Reponses que la base doit rendre, par table. */
let reponseTenantParSlug: { id: string } | null;
let reponseMembreCible: LigneMembre | null;
let reponseMembresSansCible: LigneMembre[];

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'tenants') {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'is']) chain[m] = () => chain;
        chain.maybeSingle = async () => ({ data: reponseTenantParSlug, error: null });
        return chain;
      }
      // Reglages du restaurant par poste: aucun, la matrice par defaut decide.
      if (table === 'poste_permissions') {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'eq']) chain[m] = () => chain;
        chain.in = async () => ({ data: [], error: null });
        return chain;
      }
      // admin_users: `maybeSingle` pour la cible, `limit` pour l'ambiguite.
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'order']) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: reponseMembreCible, error: null });
      chain.limit = async () => ({ data: reponseMembresSansCible, error: null });
      return chain;
    },
  }),
}));

import { resolveCheckoutTenant } from '../checkout-tenant';

const UTILISATEUR = { id: 'user-1', email: 'patron@resto.test' };

function membre(
  tenantId: string,
  postes: string[] = ['owner'],
  permission_overrides: Record<string, boolean> | null = null,
): LigneMembre {
  return {
    postes,
    permission_overrides,
    tenant_id: tenantId,
    tenants: { name: `Resto ${tenantId}` },
  };
}

describe('resolveCheckoutTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: UTILISATEUR }, error: null });
    reponseTenantParSlug = { id: 'tenant-2' };
    reponseMembreCible = membre('tenant-2');
    reponseMembresSansCible = [membre('tenant-1')];
  });

  it('non authentifie: 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'nope' } });
    const r = await resolveCheckoutTenant();
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it('compte sans email: 400', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u', email: null } }, error: null });
    const r = await resolveCheckoutTenant();
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('restaurant suspendu par la plateforme: 409, avec ou sans cible', async () => {
    const suspendu = membre('tenant-2');
    suspendu.tenants = { name: 'Resto', suspended_at: '2026-11-01T00:00:00Z' };
    reponseMembreCible = suspendu;
    reponseMembresSansCible = [suspendu];

    expect(await resolveCheckoutTenant({ tenantSlug: 'resto' })).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(await resolveCheckoutTenant()).toMatchObject({ ok: false, status: 409 });
    // La confirmation d'un paiement deja fait n'est pas refusee.
    expect(
      await resolveCheckoutTenant({ tenantSlug: 'resto', allowSuspended: true }),
    ).toMatchObject({ ok: true });
  });

  it('sans cible, un restaurant ferme n est pas abonnable: 404', async () => {
    const ferme = membre('tenant-1');
    ferme.tenants = { name: 'Resto', deleted_at: '2026-11-01T00:00:00Z' };
    reponseMembresSansCible = [ferme];

    expect(await resolveCheckoutTenant()).toMatchObject({ ok: false, status: 404 });
  });

  /** LE TEST DU DEFAUT: c'est la cible qui est facturee, pas la plus ancienne. */
  it('avec une cible: facture CE restaurant, pas le premier de la liste', async () => {
    reponseMembresSansCible = [membre('tenant-1')]; // le plus ancien, a ignorer
    const r = await resolveCheckoutTenant({ tenantSlug: 'deuxieme-resto' });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tenant.tenant_id).toBe('tenant-2');
  });

  it('cible inconnue: 404', async () => {
    reponseTenantParSlug = null;
    const r = await resolveCheckoutTenant({ tenantSlug: 'inexistant' });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('cible hors des acces de l utilisateur: 403', async () => {
    // Sans cette verification, designer un slug suffirait a facturer le
    // restaurant de quelqu'un d'autre (IDOR).
    reponseMembreCible = null;
    const r = await resolveCheckoutTenant({ tenantSlug: 'resto-d-un-autre' });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  // Le gerant n'a billing.manage qu'au niveau borne (voir, pas payer).
  it.each(['manager', 'waiter', 'chef', 'cashier'])(
    'poste %s: 403, n engage pas la depense',
    async (poste) => {
      reponseMembreCible = membre('tenant-2', [poste]);
      const r = await resolveCheckoutTenant({ tenantSlug: 'deuxieme-resto' });
      expect(r).toMatchObject({ ok: false, status: 403 });
    },
  );

  it('proprietaire: autorise', async () => {
    reponseMembreCible = membre('tenant-2', ['owner']);
    const r = await resolveCheckoutTenant({ tenantSlug: 'deuxieme-resto' });
    expect(r.ok).toBe(true);
  });

  it('temoin: un gerant avec permission_overrides billing.manage est autorise', async () => {
    reponseMembreCible = membre('tenant-2', ['manager'], { 'billing.manage': true });
    const r = await resolveCheckoutTenant({ tenantSlug: 'deuxieme-resto' });
    expect(r.ok).toBe(true);
  });

  it('sans cible et un seul restaurant: celui-la', async () => {
    const r = await resolveCheckoutTenant();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tenant.tenant_id).toBe('tenant-1');
  });

  /** L'ancien comportement choisissait ici en silence. Il choisissait mal. */
  it('sans cible et plusieurs restaurants: refuse au lieu de deviner', async () => {
    reponseMembresSansCible = [membre('tenant-1'), membre('tenant-2')];
    const r = await resolveCheckoutTenant();

    expect(r).toMatchObject({ ok: false, status: 400, code: 'TENANT_AMBIGU' });
  });

  /**
   * Trou de ma premiere version, trouve par la revue de securite: la
   * verification de role n'etait posee que sur la branche avec cible. Un
   * employe dont le compte n'a qu'un seul restaurant pouvait ouvrir une caisse
   * et engager une depense.
   */
  it.each(['manager', 'waiter', 'chef'])(
    'sans cible, poste %s: 403 aussi - la garde ne vit pas sur une seule branche',
    async (poste) => {
      reponseMembresSansCible = [membre('tenant-1', [poste])];
      const r = await resolveCheckoutTenant();
      expect(r).toMatchObject({ ok: false, status: 403 });
    },
  );

  it('sans cible, un gerant avec permission_overrides billing.manage est autorise', async () => {
    reponseMembresSansCible = [membre('tenant-1', ['manager'], { 'billing.manage': true })];
    const r = await resolveCheckoutTenant();
    expect(r.ok).toBe(true);
  });

  it('aucun restaurant: 404', async () => {
    reponseMembresSansCible = [];
    const r = await resolveCheckoutTenant();
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('un slug vide est traite comme absent', async () => {
    const r = await resolveCheckoutTenant({ tenantSlug: '   ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tenant.tenant_id).toBe('tenant-1');
  });
});
