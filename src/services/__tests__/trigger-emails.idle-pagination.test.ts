import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Contre-audit 1, D2: la tache d'inactivite relit par tours. On la fait
 * tourner contre le VRAI client supabase-js, dont seul `fetch` est remplace:
 * les URL mesurees sont donc exactement celles qui partiraient vers PostgREST.
 */

const { sendTrialIdleEmail } = vi.hoisted(() => ({ sendTrialIdleEmail: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../email.service', () => ({
  createEmailService: () => ({ sendTrialIdleEmail }),
  isEmailDeliveryConfigured: () => true,
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { idleCursorFilter, sendTrialIdleEmails } from '../trigger-emails.service';

const NOW = new Date('2026-11-24T09:00:00Z');
const ORIGINAL_SECRET = process.env.EMAIL_UNSUBSCRIBE_SECRET;

interface Tenant {
  id: string;
  name: string;
  slug: string;
  last_active_at: string;
  owners: { email: string }[];
}

/**
 * Restaurants inactifs. Plusieurs partagent la MEME date: le curseur doit les
 * departager par `id`, sans en sauter ni en relire.
 */
function tenants(blocked: number, free: number): Tenant[] {
  return Array.from({ length: blocked + free }, (_, i) => {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    return {
      id,
      name: `R${i}`,
      slug: `r${i}`,
      // 7 restaurants par heure a partir du 1er octobre: toutes > 48 h.
      last_active_at: new Date(Date.UTC(2026, 9, 1) + Math.floor(i / 7) * 3_600_000).toISOString(),
      owners: [{ email: i < blocked ? `bloque${i}@resto.test` : `libre${i}@resto.test` }],
    };
  }).sort((a, b) =>
    a.last_active_at === b.last_active_at
      ? a.id.localeCompare(b.id)
      : a.last_active_at.localeCompare(b.last_active_at),
  );
}

/** Fausse API PostgREST: applique curseur et limite, retient chaque URL. */
function fakePostgrest(data: Tenant[], unsubscribed: Set<string>) {
  const tenantUrls: string[] = [];
  const returnedIds: string[][] = [];
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const fetchMock = async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (url.pathname.endsWith('/rpc/claim_activation_event')) return json(true);
    if (url.pathname.endsWith('/email_unsubscribes')) {
      const asked = (url.searchParams.get('email_normalized') ?? '')
        .replace(/^in\.\(/, '')
        .replace(/\)$/, '')
        .split(',')
        .map((e) => e.replace(/^"|"$/g, ''));
      return json(asked.filter((e) => unsubscribed.has(e)).map((e) => ({ email_normalized: e })));
    }
    tenantUrls.push(url.toString());
    const or = url.searchParams.get('or') ?? '';
    const m =
      /^\(last_active_at\.gt\."([^"]+)",and\(last_active_at\.eq\."([^"]+)",id\.gt\.([^)]+)\)\)$/.exec(
        or,
      );
    const rows = data
      .filter((t) =>
        m ? t.last_active_at > m[1] || (t.last_active_at === m[2] && t.id > m[3]) : true,
      )
      .slice(0, Number(url.searchParams.get('limit') ?? 1000));
    returnedIds.push(rows.map((r) => r.id));
    return json(rows);
  };
  const client = createClient('http://postgrest.test', 'cle-de-test', {
    global: { fetch: fetchMock },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, tenantUrls, returnedIds };
}

beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = 'un-secret-de-test-suffisamment-long-0123456789';
  sendTrialIdleEmail.mockReset().mockResolvedValue({ success: true });
});
afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  else process.env.EMAIL_UNSUBSCRIBE_SECRET = ORIGINAL_SECRET;
});

describe('sendTrialIdleEmails: curseur (contre-audit 1, D2)', () => {
  it('10 tours: URL de taille fixe, aucun restaurant relu, les libres du 10e tour relances', async () => {
    const data = tenants(450, 5);
    const blocked = new Set(
      data.filter((t) => t.owners[0].email.startsWith('bloque')).map((t) => t.owners[0].email),
    );
    const { client, tenantUrls, returnedIds } = fakePostgrest(data, blocked);

    const report = await sendTrialIdleEmails(client, NOW);

    expect(tenantUrls).toHaveLength(10);
    // Taille fixe: d'un tour a l'autre, seul le contenu du curseur change.
    const tailles = tenantUrls.map((u) => u.length);
    expect(Math.max(...tailles)).toBeLessThan(2000);
    expect(Math.max(...tailles.slice(1)) - Math.min(...tailles.slice(1))).toBeLessThanOrEqual(4);
    // Aucun doublon entre tours, et tout est lu dans l'ordre.
    const vus = returnedIds.flat();
    expect(new Set(vus).size).toBe(vus.length);
    expect(vus).toEqual(data.map((t) => t.id));
    expect(report).toEqual({ candidates: 455, sent: 5, unsubscribed: 450 });
  });

  it('dates egales a la frontiere d une page: rien n est saute', async () => {
    // 50 restaurants a la meme date puis 3 autres a la meme date: la page 1
    // finit au milieu d'un groupe de dates egales.
    const data = tenants(0, 53).map((t) => ({ ...t, last_active_at: '2026-11-01T08:00:00.000Z' }));
    const { client, returnedIds } = fakePostgrest(data, new Set());
    sendTrialIdleEmail.mockResolvedValue({ success: true });
    const report = await sendTrialIdleEmails(client, NOW);
    // Plafond de 50 envois par passage atteint: un seul tour.
    expect(report.sent).toBe(50);
    expect(returnedIds).toHaveLength(1);
  });

  it('filtre de reprise: taille fixe, valeurs entre guillemets', () => {
    expect(idleCursorFilter(null)).toBe('last_active_at.not.is.null');
    expect(idleCursorFilter({ lastActiveAt: '2026-11-01T08:00:00+00:00', id: 'abc' })).toBe(
      'last_active_at.gt."2026-11-01T08:00:00+00:00",and(last_active_at.eq."2026-11-01T08:00:00+00:00",id.gt.abc)',
    );
  });
});
