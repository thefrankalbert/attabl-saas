import { describe, it, expect, vi, beforeEach } from 'vitest';

// B8 (revue ligne par ligne, lot B2b-2): l'unicite portait sur (user_id, endpoint).
// Un meme telephone ne recevait donc les alertes que d'UN restaurant: se
// reabonner depuis B deplacait la ligne de A vers B, et le bouton affichait
// "abonne" d'apres le navigateur, pas d'apres le serveur.

vi.mock('@/lib/rate-limit', () => ({
  pushSubscriptionLimiter: { check: vi.fn(async () => ({ success: true })) },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/push/endpoints-autorises', () => ({
  verifierEndpointPush: () => ({ autorise: true }),
}));

interface Call {
  op: string;
  args: unknown[];
}
const calls: Call[] = [];
/**
 * Lignes `push_subscriptions` lisibles par la route. La lecture d'etat APPLIQUE
 * les filtres `eq` (contre-audit 2: retirer `user_id` doit faire tomber un test).
 */
let rows: Array<Record<string, unknown>> = [];

function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  const filters: Array<[string, unknown]> = [];
  for (const op of ['select', 'eq', 'delete']) {
    c[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      if (op === 'eq') filters.push([args[0] as string, args[1]]);
      return c;
    };
  }
  c.upsert = async (...args: unknown[]) => {
    calls.push({ op: 'upsert', args });
    return { error: null };
  };
  c.maybeSingle = async () => ({
    data: rows.find((r) => filters.every(([k, v]) => r[k] === v)) ?? null,
    error: null,
  });
  c.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
  return c;
}

vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: vi.fn(async () => ({
    user: { id: 'user-1', email: '' },
    tenantId: 'tenant-B',
    supabase: { from: () => chain() },
  })),
  AuthError: class AuthError extends Error {
    status = 401;
  },
}));

import { POST, DELETE } from '../push-subscriptions/route';
import { POST as STATUS } from '../push-subscriptions/status/route';
import { NextRequest } from 'next/server';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';

function req(method: string, body?: unknown, query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/push-subscriptions${query}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json' },
  });
}

describe('/api/push-subscriptions - un abonnement par restaurant', () => {
  beforeEach(() => {
    calls.length = 0;
    rows = [];
  });

  it('POST: upsert sur (tenant_id, user_id, endpoint), le restaurant de la session', async () => {
    const res = await POST(req('POST', { endpoint: ENDPOINT, p256dh: 'k', auth: 'a' }));
    expect(res.status).toBe(200);
    const upsert = calls.find((c) => c.op === 'upsert');
    expect(upsert?.args[0]).toMatchObject({ tenant_id: 'tenant-B', user_id: 'user-1' });
    expect(upsert?.args[1]).toEqual({ onConflict: 'tenant_id,user_id,endpoint' });
  });

  it('DELETE: ne supprime que la ligne du restaurant courant', async () => {
    const res = await DELETE(req('DELETE', { endpoint: ENDPOINT }));
    expect(res.status).toBe(200);
    expect(calls).toContainEqual({ op: 'delete', args: [] });
    expect(calls).toContainEqual({ op: 'eq', args: ['tenant_id', 'tenant-B'] });
    expect(calls).toContainEqual({ op: 'eq', args: ['user_id', 'user-1'] });
    expect(calls).toContainEqual({ op: 'eq', args: ['endpoint', ENDPOINT] });
  });

  it('statut: l etat "abonne" est celui du serveur pour le restaurant courant', async () => {
    rows = [];
    const off = await STATUS(req('POST', { endpoint: ENDPOINT }, '/status'));
    expect(await off.json()).toEqual({ subscribed: false });
    expect(calls).toContainEqual({ op: 'eq', args: ['tenant_id', 'tenant-B'] });
    expect(calls).toContainEqual({ op: 'eq', args: ['endpoint', ENDPOINT] });

    rows = [{ id: 'row-B', tenant_id: 'tenant-B', user_id: 'user-1', endpoint: ENDPOINT }];
    const on = await STATUS(req('POST', { endpoint: ENDPOINT }, '/status'));
    expect(await on.json()).toEqual({ subscribed: true });
  });

  // Contre-audit 2 (defaut 4): la ligne d'un AUTRE compte, meme appareil, meme
  // restaurant, ne compte pas.
  it('statut: l appareil abonne par un autre compte ne compte pas', async () => {
    rows = [{ id: 'row-X', tenant_id: 'tenant-B', user_id: 'user-2', endpoint: ENDPOINT }];
    const res = await STATUS(req('POST', { endpoint: ENDPOINT }, '/status'));
    expect(await res.json()).toEqual({ subscribed: false });
  });

  it('statut: endpoint absent ou invalide -> 400', async () => {
    expect((await STATUS(req('POST', { endpoint: 'pas-une-url' }, '/status'))).status).toBe(400);
  });

  // Contre-audit 1 (defaut 4): l'identifiant d'appareil ne passe plus dans une URL.
  it('la route principale n a plus de lecture GET par l URL', async () => {
    const route = await import('../push-subscriptions/route');
    expect('GET' in route).toBe(false);
  });
});
