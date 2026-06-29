/**
 * Parcours 8: isolation cross-tenant (BOLA / IDOR).
 *
 * Un membre authentifie du tenant A ne doit jamais atteindre les ressources d'un
 * tenant B via leur id. On seed DEUX tenants, on cree des ressources reelles dans
 * B (commande, invitation, assignation), puis on attaque avec la session du
 * proprietaire de A.
 *
 * POINT CLE: les routes claim/assignment derivent le tenant du Referer (le
 * middleware injecte x-tenant-slug a partir de /sites/<slug>/). Si l'attaquant
 * ciblait son PROPRE slug (A), la mutation serait filtree par tenant_id=A et
 * deviendrait un no-op trivial sur un id de B - le test passerait quoi qu'il
 * arrive, sans rien prouver. On force donc le Referer sur le slug de B: la route
 * resout tenant=B puis doit constater que le proprietaire de A n'en est PAS membre
 * et refuser (403). C'est la vraie garde cross-tenant qu'on exerce ici.
 *
 * Les routes invitations resolvent le tenant depuis l'invitation elle-meme (lookup
 * admin par id) puis verifient l'appartenance de l'appelant: meme avec le Referer
 * de B, le proprietaire de A n'est pas membre de B -> 403.
 *
 * Assertion: chaque tentative renvoie 401/403/404, OU (no-op 200) la ressource de B
 * est restee STRICTEMENT intacte (statut, token, expiration, assignation). Remplace
 * le template security/generated-tests/security-bola.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { hasSeedEnv, journeyEnv } from './fixtures/env';
import { OWNER, RESTAURANT_TEAM, loginPersonaForSlug, type Persona } from './fixtures/personas';
import {
  getAdmin,
  getAssignmentRow,
  getInvitationRow,
  getOrderState,
  getStaffAdminId,
  seedInvitation,
  seedOrderRow,
  seedStaffForTenant,
  seedTableAssignment,
  seedTenantWithMenu,
  seedZoneAndTable,
  teardownTenantBySlug,
} from './fixtures/seed';

const SLUG_A = journeyEnv.tenantSlug;
const SLUG_B = `${journeyEnv.tenantSlug}-b`;

// Equipe du tenant B: on clone owner + serveur en remplacant le slug dans l'email
// (les emails du RESTAURANT_TEAM sont derives du slug A).
const TEAM_B: Persona[] = RESTAURANT_TEAM.filter(
  (p) => p.key === 'owner' || p.key === 'server',
).map((p) => ({ ...p, email: p.email?.replace(SLUG_A, SLUG_B) }));

const ACCEPTED = [401, 403, 404];

/** Session du proprietaire de A, mais ciblant le tenant B via le Referer. */
function attackerCtx() {
  return loginPersonaForSlug(OWNER, SLUG_B);
}

test.describe.serial('08 - Isolation cross-tenant (BOLA)', () => {
  let tenantBId: string | null = null;
  const bRes = { orderId: '', invitationId: '', assignmentId: '' };
  // Valeurs de reference de l'invitation de B (pour detecter une rotation par resend).
  const bInviteBaseline = { token: '', expiresAt: '' };

  test.beforeAll(async () => {
    test.skip(!hasSeedEnv(), 'JOURNEY_SUPABASE_URL/SERVICE_ROLE_KEY requis (base de TEST).');

    // Tenant A (attaquant) + son proprietaire.
    const a = await seedTenantWithMenu({ slug: SLUG_A });
    await seedStaffForTenant(a.tenantId, [OWNER]);

    // Tenant B (victime) + equipe + ressources reelles.
    const b = await seedTenantWithMenu({ slug: SLUG_B });
    tenantBId = b.tenantId;
    await seedStaffForTenant(b.tenantId, TEAM_B);

    const { tableId } = await seedZoneAndTable(b.tenantId);
    bRes.orderId = await seedOrderRow(b.tenantId);

    const ownerAdminId = await getStaffAdminId(b.tenantId, 'owner');
    const serverAdminId = await getStaffAdminId(b.tenantId, 'server');
    if (!ownerAdminId || !serverAdminId) {
      throw new Error('seed BOLA: admin_users de B introuvables (owner/server).');
    }
    bRes.invitationId = await seedInvitation(b.tenantId, ownerAdminId);
    bRes.assignmentId = await seedTableAssignment(b.tenantId, tableId, serverAdminId);

    const inv = await getInvitationRow(bRes.invitationId);
    bInviteBaseline.token = inv?.token ?? '';
    bInviteBaseline.expiresAt = inv?.expires_at ?? '';
  });

  test.afterAll(async () => {
    if (hasSeedEnv()) {
      await teardownTenantBySlug(SLUG_B);
      await teardownTenantBySlug(SLUG_A);
    }
  });

  // Avec le Referer de B + session owner de A, la route doit BLOQUER (401/403/404):
  // tenant=B resolu, owner de A non membre. On EXIGE le blocage (un 2xx/400 trahirait
  // que la garde n'est pas exercee) ET on verifie en plus que la ressource de B est
  // intacte (defense en profondeur, au cas ou un 2xx no-op se glisserait).

  test('A ne peut pas reclamer (claim) la commande de B', async () => {
    test.skip(!tenantBId, 'seed indisponible');
    const ctx = await attackerCtx();
    const res = await ctx.post(`/api/orders/${bRes.orderId}/claim`, { data: {} });
    expect(ACCEPTED, `claim doit etre bloque, recu ${res.status()}`).toContain(res.status());
    const state = await getOrderState(bRes.orderId);
    expect(state?.server_id, 'commande de B reclamee par A').toBeNull();
    await ctx.dispose();
  });

  test('A ne peut pas supprimer une invitation de B', async () => {
    test.skip(!tenantBId, 'seed indisponible');
    const ctx = await attackerCtx();
    const res = await ctx.delete(`/api/invitations/${bRes.invitationId}`);
    expect(ACCEPTED, `delete invitation doit etre bloque, recu ${res.status()}`).toContain(
      res.status(),
    );
    const row = await getInvitationRow(bRes.invitationId);
    expect(row, 'invitation de B supprimee par A').not.toBeNull();
    expect(row?.status).toBe('pending');
    await ctx.dispose();
  });

  test('A ne peut pas relancer (resend) une invitation de B', async () => {
    test.skip(!tenantBId, 'seed indisponible');
    const ctx = await attackerCtx();
    const res = await ctx.post(`/api/invitations/${bRes.invitationId}/resend`, { data: {} });
    expect(ACCEPTED, `resend invitation doit etre bloque, recu ${res.status()}`).toContain(
      res.status(),
    );
    // resend ne change pas le statut (reste 'pending'): son VRAI effet est la rotation
    // token + expiration. Une attaque reussie les modifierait -> on verifie l'invariance.
    const row = await getInvitationRow(bRes.invitationId);
    expect(row?.token, 'resend a fait tourner le token de B').toBe(bInviteBaseline.token);
    expect(row?.expires_at, 'resend a prolonge l invitation de B').toBe(bInviteBaseline.expiresAt);
    await ctx.dispose();
  });

  test('A ne peut pas liberer (delete) une assignation de B', async () => {
    test.skip(!tenantBId, 'seed indisponible');
    const ctx = await attackerCtx();
    const res = await ctx.delete(`/api/assignments/${bRes.assignmentId}`);
    expect(ACCEPTED, `delete assignation doit etre bloque, recu ${res.status()}`).toContain(
      res.status(),
    );
    const row = await getAssignmentRow(bRes.assignmentId);
    expect(row, 'assignation de B supprimee par A').not.toBeNull();
    expect(row?.ended_at, 'assignation de B terminee par A').toBeNull();
    await ctx.dispose();
  });

  test('aucune ressource de B na fuite (controle final)', async () => {
    test.skip(!tenantBId, 'seed indisponible');
    const db = getAdmin();
    // Toutes les ressources de B sont toujours la et STRICTEMENT intactes.
    const order = await getOrderState(bRes.orderId);
    expect(order?.server_id).toBeNull();
    const invitation = await getInvitationRow(bRes.invitationId);
    expect(invitation?.status).toBe('pending');
    expect(invitation?.token).toBe(bInviteBaseline.token);
    expect(invitation?.expires_at).toBe(bInviteBaseline.expiresAt);
    const assignment = await getAssignmentRow(bRes.assignmentId);
    expect(assignment?.ended_at).toBeNull();
    // Les lignes appartiennent bien au tenant B (sanity: rien n'a migre vers A).
    const { count } = await db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('id', bRes.orderId)
      .eq('tenant_id', tenantBId as string);
    expect(count).toBe(1);
  });
});
