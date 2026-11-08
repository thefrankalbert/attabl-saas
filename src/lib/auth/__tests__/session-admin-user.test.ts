/**
 * Tests de la derivation de session -> etablissement.
 *
 * C'est le point ou l'application decide DE QUEL restaurant un utilisateur
 * connecte est en train de parler. Une erreur ici ne produit pas un plantage
 * mais un silence: l'operateur voit les donnees d'un autre etablissement, ou se
 * voit refuser le sien. SESSION-FALLBACK est ne exactement de la: le code
 * retombait sur l'appartenance la plus ancienne, au hasard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const ensureTenantForOnboarding = vi.fn();
const loggerError = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: (...a: unknown[]) => loggerError(...a), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/services/signup.service', () => ({
  createSignupService: () => ({ ensureTenantForOnboarding }),
}));

/** Resultat que le mock admin renverra a la requete admin_users. */
const query = { rows: [] as unknown[], error: null as unknown };
/** Filtres `.eq()` observes, pour verifier le scope de la requete. */
let filters: Array<[string, unknown]> = [];

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const builder = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return builder;
          },
          then(resolve: (v: unknown) => void) {
            resolve({ data: query.rows, error: query.error });
          },
        };
        return builder;
      },
    }),
  }),
}));

import { resolveSessionAdminUser } from '../session-admin-user';

function tenantRow(tenantId: string, role = 'owner', onboardingCompleted = true, createdAt = '1') {
  return {
    tenant_id: tenantId,
    role,
    tenants: { slug: tenantId, onboarding_completed: onboardingCompleted, created_at: createdAt },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  filters = [];
  query.rows = [];
  query.error = null;
  getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c', user_metadata: {} } } });
});

describe('resolveSessionAdminUser', () => {
  it('refuse 401 sans session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const r = await resolveSessionAdminUser();

    expect(r).toEqual({ ok: false, status: 401, error: 'Non authentifie' });
  });

  it('rend le tenant et le role de l utilisateur', async () => {
    query.rows = [tenantRow('t1', 'manager')];

    const r = await resolveSessionAdminUser();

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.userId).toBe('u1');
      expect(r.adminUser).toEqual({
        tenant_id: 't1',
        role: 'manager',
        tenant_slug: 't1',
        onboarding_completed: true,
      });
    }
  });

  it('scope la requete sur l utilisateur ET sur is_active par defaut', async () => {
    // Sans le filtre is_active, un employe desactive garderait ses acces: c'est
    // exactement le constat DB-03.
    query.rows = [tenantRow('t1')];

    await resolveSessionAdminUser();

    expect(filters).toContainEqual(['user_id', 'u1']);
    expect(filters).toContainEqual(['is_active', true]);
  });

  it('n applique pas is_active quand l appelant ne l exige pas', async () => {
    query.rows = [tenantRow('t1')];

    await resolveSessionAdminUser({ requireActive: false });

    expect(filters).toContainEqual(['user_id', 'u1']);
    expect(filters.some(([col]) => col === 'is_active')).toBe(false);
  });

  it('refuse 403 quand aucune appartenance n existe', async () => {
    query.rows = [];

    const r = await resolveSessionAdminUser();

    expect(r).toEqual({ ok: false, status: 403, error: 'Compte etablissement introuvable' });
  });

  it('refuse 403 et journalise quand la requete echoue', async () => {
    query.error = new Error('base injoignable');

    const r = await resolveSessionAdminUser();

    expect(r.ok).toBe(false);
    expect(loggerError).toHaveBeenCalled();
  });

  it('choisit l etablissement dont l onboarding est inachevé, pas le premier venu', async () => {
    // Un proprietaire multi-etablissements ne doit pas atterrir au hasard.
    query.rows = [
      tenantRow('fini', 'owner', true, '2026-01-01'),
      tenantRow('en-cours', 'owner', false, '2026-02-01'),
    ];

    const r = await resolveSessionAdminUser();

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.adminUser.tenant_id).toBe('en-cours');
  });
});

describe('recuperation apres inscription partielle', () => {
  it('cree l etablissement manquant puis rend la main', async () => {
    // Signup interrompu: l'utilisateur existe, son tenant non. Sans cela il
    // reste bloque a l'onboarding sans aucun moyen d'en sortir.
    let appel = 0;
    Object.defineProperty(query, 'rows', {
      get: () => (appel++ === 0 ? [] : [tenantRow('t-neuf')]),
      configurable: true,
    });
    ensureTenantForOnboarding.mockResolvedValue(undefined);

    const r = await resolveSessionAdminUser({ provisionIfMissing: true });

    expect(ensureTenantForOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', email: 'a@b.c', plan: 'starter' }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.adminUser.tenant_id).toBe('t-neuf');

    delete (query as { rows?: unknown }).rows;
    query.rows = [];
  });

  it('refuse 403 sans email, sans tenter de creer', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: null, user_metadata: {} } } });
    query.rows = [];

    const r = await resolveSessionAdminUser({ provisionIfMissing: true });

    expect(r).toEqual({
      ok: false,
      status: 403,
      error: 'Email requis pour creer votre etablissement',
    });
    expect(ensureTenantForOnboarding).not.toHaveBeenCalled();
  });

  it('refuse 403 et journalise quand la creation echoue', async () => {
    query.rows = [];
    ensureTenantForOnboarding.mockRejectedValue(new Error('conflit de slug'));

    const r = await resolveSessionAdminUser({ provisionIfMissing: true });

    expect(r).toEqual({
      ok: false,
      status: 403,
      error: 'Impossible de creer votre etablissement',
    });
    expect(loggerError).toHaveBeenCalled();
  });

  it('ne cree rien quand l option n est pas demandee', async () => {
    query.rows = [];

    await resolveSessionAdminUser();

    expect(ensureTenantForOnboarding).not.toHaveBeenCalled();
  });
});

describe('choix explicite de l etablissement (?site=) et proprietaire seul', () => {
  it('rend l etablissement demande par son slug, meme s il n est pas le plus recent', async () => {
    // La fenetre "Reprendre" de B doit reprendre B, pas C (plus recent).
    query.rows = [
      tenantRow('b', 'owner', false, '2026-01-01'),
      tenantRow('c', 'owner', false, '2026-02-01'),
    ];
    const r = await resolveSessionAdminUser({ siteSlug: 'b' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.adminUser.tenant_id).toBe('b');
  });

  it('refuse un slug dont l utilisateur n est pas membre, SANS retomber sur un autre', async () => {
    query.rows = [tenantRow('a', 'owner', false)];
    const r = await resolveSessionAdminUser({ siteSlug: 'pas-a-moi', provisionIfMissing: true });
    expect(r).toEqual({ ok: false, status: 403, error: 'Compte etablissement introuvable' });
    // Un mauvais lien ne cree pas de restaurant.
    expect(ensureTenantForOnboarding).not.toHaveBeenCalled();
  });

  it('ownerOnly ignore les appartenances non proprietaire', async () => {
    // Proprietaire de "a" (inacheve) ET serveur dans "b" (plus recent, inacheve).
    query.rows = [
      tenantRow('a', 'owner', false, '2026-01-01'),
      tenantRow('b', 'waiter', false, '2026-02-01'),
    ];
    const r = await resolveSessionAdminUser({ ownerOnly: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.adminUser.tenant_id).toBe('a');
  });

  it('ownerOnly ne cree PAS de restaurant pour un compte qui n est que serveur', async () => {
    query.rows = [tenantRow('b', 'waiter', false)];
    const r = await resolveSessionAdminUser({ ownerOnly: true, provisionIfMissing: true });
    expect(r.ok).toBe(false);
    expect(ensureTenantForOnboarding).not.toHaveBeenCalled();
  });

  it('ne cree PAS de restaurant sur une erreur de lecture (erreur passagere != aucun restaurant)', async () => {
    query.error = new Error('base injoignable');
    const r = await resolveSessionAdminUser({ provisionIfMissing: true });
    expect(r.ok).toBe(false);
    expect(ensureTenantForOnboarding).not.toHaveBeenCalled();
  });
});
