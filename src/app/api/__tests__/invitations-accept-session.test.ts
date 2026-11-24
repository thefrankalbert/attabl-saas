/**
 * POST /api/invitations/accept - transmission de la session au service.
 *
 * Le controle de consentement vit dans le service (voir
 * src/services/__tests__/invitation.token-consent.test.ts). Il ne vaut que si
 * la route lui transmet l'adresse de la session VERIFIEE COTE SERVEUR. Ce
 * fichier verrouille ce cablage: sans lui, le service croirait a chaque fois
 * qu'aucun titulaire n'est connecte.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const signInWithPassword = vi.fn();
const acceptInvitation = vi.fn();
const validateToken = vi.fn();
const { tenantRead, canAddStaff } = vi.hoisted(() => ({
  tenantRead: { value: { data: null as unknown, error: null as unknown } },
  canAddStaff: vi.fn(),
}));
const ACTIVE_TENANT = { id: 'tenant-1', is_active: true, subscription_plan: 'pro' };

vi.mock('@/lib/rate-limit', () => ({
  invitationAcceptLimiter: { check: vi.fn().mockResolvedValue({ success: true }) },
  getClientIp: () => '203.0.113.7',
}));

vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve(tenantRead.value) }),
      }),
    }),
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        getUser: () => getUser(),
        signInWithPassword: (creds: unknown) => signInWithPassword(creds),
      },
    }),
}));

vi.mock('@/services/invitation.service', () => ({
  createInvitationService: () => ({ validateToken, acceptInvitation }),
}));

vi.mock('@/services/plan-enforcement.service', () => ({
  createPlanEnforcementService: () => ({
    canAddStaff,
    canAddAdmin: vi.fn(),
  }),
  STAFF_ROLES: ['manager', 'cashier', 'chef', 'waiter'],
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from '../invitations/accept/route';

const TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

function buildRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/invitations/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/invitations/accept - session du titulaire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantRead.value = { data: ACTIVE_TENANT, error: null };
    validateToken.mockResolvedValue({
      id: 'inv-1',
      tenant_id: 'tenant-1',
      email: 'equipier@resto.test',
      role: 'manager',
    });
    acceptInvitation.mockResolvedValue({ tenantSlug: 'mon-resto' });
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
  });

  it("transmet au service l'adresse de la session verifiee cote serveur", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'auth-equipier', email: 'equipier@resto.test' } },
      error: null,
    });

    const res = await POST(buildRequest({ token: TOKEN }));

    expect(res.status).toBe(200);
    expect(acceptInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ token: TOKEN, authenticatedEmail: 'equipier@resto.test' }),
    );
  });

  // REFUTATION R1' du contre-audit LOT 4: l'adresse de la session prouvait le
  // consentement, mais le compte reellement enrole etait lu dans
  // admin_users.email - un miroir applicatif qu'un owner peut reecrire. La
  // route doit donc transmettre AUSSI l'identifiant du compte auth de la
  // session, seule cle d'identite non modifiable par un tiers.
  it("transmet l'identifiant du compte auth de la session, pas seulement son adresse", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'auth-equipier', email: 'equipier@resto.test' } },
      error: null,
    });

    const res = await POST(buildRequest({ token: TOKEN }));

    expect(res.status).toBe(200);
    expect(acceptInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticatedEmail: 'equipier@resto.test',
        authenticatedUserId: 'auth-equipier',
      }),
    );
  });

  it('transmet undefined quand aucune session n est ouverte (parcours nouvel employe)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(
      buildRequest({ token: TOKEN, full_name: 'Awa Traore', password: 'Motdepasse-Solide-7' }),
    );

    expect(res.status).toBe(200);
    expect(acceptInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ authenticatedEmail: undefined, authenticatedUserId: undefined }),
    );
  });

  // UNAUTHORIZED -> 401 dans ce depot (serviceErrorToStatus): c'est le code qui
  // dit au client "authentifie-toi", exactement ce que la page doit proposer.
  it('renvoie 401 quand le service refuse faute de session du titulaire', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { ServiceError } = await import('@/services/errors');
    acceptInvitation.mockRejectedValue(new ServiceError('Connectez-vous', 'UNAUTHORIZED'));

    const res = await POST(buildRequest({ token: TOKEN }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Connectez-vous' });
  });
  it('connecte le nouvel employe avec le mot de passe choisi', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(
      buildRequest({ token: TOKEN, full_name: 'Awa Traore', password: 'Motdepasse-Solide-7' }),
    );
    expect(res.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'equipier@resto.test',
      password: 'Motdepasse-Solide-7',
    });
  });

  it('ne reconnecte pas un titulaire deja connecte', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'auth-equipier', email: 'equipier@resto.test' } },
      error: null,
    });
    await POST(buildRequest({ token: TOKEN }));
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('un echec de connexion automatique ne fait pas echouer l acceptation', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'x' } });
    const res = await POST(
      buildRequest({ token: TOKEN, full_name: 'Awa Traore', password: 'Motdepasse-Solide-7' }),
    );
    expect(res.status).toBe(200);
  });

  // Revue L022 (A24, A25).
  it('lecture du restaurant en echec: refus, sans acceptation ni limites sautees', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    tenantRead.value = { data: null, error: { message: 'timeout' } };
    const res = await POST(buildRequest({ token: TOKEN }));
    expect(res.status).toBe(500);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it('restaurant inactif: refus 409, sans acceptation', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    tenantRead.value = { data: { ...ACTIVE_TENANT, is_active: false }, error: null };
    const res = await POST(buildRequest({ token: TOKEN }));
    expect(res.status).toBe(409);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it('temoin: restaurant actif, la limite du plan est appliquee', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    acceptInvitation.mockResolvedValue({ tenantSlug: 'resto' });
    await POST(buildRequest({ token: TOKEN }));
    expect(canAddStaff).toHaveBeenCalledWith(ACTIVE_TENANT);
  });

  it('corps non JSON: 400, pas une erreur serveur', async () => {
    const res = await POST(
      new Request('http://localhost:3000/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{pas du json',
      }),
    );
    expect(res.status).toBe(400);
  });
});
