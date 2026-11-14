import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Coupure du restaurant (audit A-02): le proxy ne garde que les PAGES, jamais
 * `/api/*`. Pour chaque route admin qui ecrit, quand `assertTenantServing`
 * refuse, la route repond 403 avec le message de coupure et n'ecrit rien. Les
 * sorties de securite (revoquer une invitation) restent permises.
 */

const LOCK_MESSAGE = 'Ce restaurant est temporairement indisponible';
const T = '22222222-2222-4222-a222-222222222222';
const INV_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const { mockAssertServing, writeSpy } = vi.hoisted(() => ({
  mockAssertServing: vi.fn(),
  writeSpy: vi.fn(),
}));

vi.mock('@/lib/billing/assert-tenant-serving', async () => {
  const { AuthError } = await import('@/lib/auth/get-session');
  class TenantLockedError extends AuthError {
    constructor(message = 'Ce restaurant est temporairement indisponible') {
      super(message, 403);
    }
  }
  return { assertTenantServing: mockAssertServing, TenantLockedError };
});

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => (k === 'x-tenant-slug' ? 'demo' : null) }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));
vi.mock('@/lib/rate-limit', () => {
  const ok = { check: async () => ({ success: true }) };
  return {
    uploadLimiter: ok,
    excelImportLimiter: ok,
    invitationManageLimiter: ok,
    invitationTenantDailyLimiter: ok,
    permissionLimiter: ok,
    assignmentLimiter: ok,
    getClientIp: () => '127.0.0.1',
  };
});
vi.mock('@/lib/api-route-context', () => ({
  runApiRoute: async (_req: Request, fn: () => Promise<Response>) => fn(),
}));
vi.mock('@/lib/cache', () => ({ getTenant: async () => ({ id: T }) }));
vi.mock('@/lib/auth/resolve-admin-permission', () => ({
  resolveAdminPermission: async () => ({ allowed: true, role: 'owner' }),
}));
vi.mock('@/lib/auth/session-admin-user', () => ({
  resolveSessionAdminUser: async () => ({
    ok: true,
    userId: 'u-1',
    adminUser: { tenant_id: T, role: 'owner' },
  }),
}));
vi.mock('@/services/excel-import.service', () => ({
  createExcelImportService: () => ({ importFromExcel: writeSpy }),
}));
vi.mock('@/services/plan-enforcement.service', () => ({
  createPlanEnforcementService: () => ({}),
  STAFF_ROLES: ['manager', 'cashier', 'chef', 'waiter'],
}));
vi.mock('@/services/email.service', () => ({ sendInvitationEmail: writeSpy }));
vi.mock('@/services/invitation.service', () => ({
  createInvitationService: () => ({
    assertNotAlreadyMember: writeSpy,
    createInvitation: writeSpy,
    cancelInvitation: writeSpy,
    resendInvitation: writeSpy,
  }),
}));
vi.mock('@/services/assignment.service', () => ({
  createAssignmentService: () => ({ assignServerToTable: writeSpy }),
}));

// Chaine PostgREST minimale: chaque table rend une ligne fixe.
function chain(table: string) {
  const rows: Record<string, unknown> = {
    tenants: { id: T },
    admin_users: { id: 'a-1', tenant_id: T, role: 'owner' },
    invitations: { tenant_id: T, role: 'waiter' },
  };
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'limit']) c[m] = () => c;
  c.single = async () => ({ data: rows[table], error: null });
  c.maybeSingle = async () => ({ data: rows[table], error: null });
  c.upsert = (...a: unknown[]) => {
    writeSpy(...a);
    return Promise.resolve({ error: null });
  };
  return c;
}
const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
  from: (table: string) => chain(table),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => supabase }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    ...supabase,
    storage: { from: () => ({ upload: writeSpy, getPublicUrl: () => ({ data: {} }) }) },
  }),
}));
vi.mock('@/lib/auth/get-session', () => {
  class AuthError extends Error {
    status: number;
    constructor(message: string, status = 403) {
      super(message);
      this.status = status;
    }
  }
  return {
    AuthError,
    getAuthenticatedUserWithTenant: async () => ({ tenantId: T, supabase, user: { id: 'u-1' } }),
  };
});

import { PERMISSION_CODES } from '@/types/permission.types';
import { POST as uploadPost } from '../upload/route';
import { POST as menuImportPost } from '../menu-import/route';
import { POST as invitationsPost } from '../invitations/route';
import { POST as resendPost } from '../invitations/[id]/resend/route';
import { DELETE as invitationDelete } from '../invitations/[id]/route';
import { PUT as permissionsPut, DELETE as permissionsDelete } from '../permissions/route';
import { POST as assignmentsPost } from '../assignments/route';
import { TenantLockedError } from '@/lib/billing/assert-tenant-serving';

function jpegForm(): FormData {
  const form = new FormData();
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  form.set('file', new File([bytes], 'logo.jpg', { type: 'image/jpeg' }));
  form.set('bucket', 'logos');
  return form;
}

function jsonReq(body: unknown, method = 'POST'): Request {
  return new Request('http://localhost/api/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const routeCtx = { params: Promise.resolve({ id: INV_ID }) };

type Call = [name: string, run: () => Promise<Response>];

const lockedWrites: Call[] = [
  [
    'POST /api/upload',
    () =>
      uploadPost(new Request('http://localhost/api/upload', { method: 'POST', body: jpegForm() })),
  ],
  [
    'POST /api/menu-import',
    () =>
      menuImportPost(
        new Request('http://localhost/api/menu-import', { method: 'POST', body: new FormData() }),
      ),
  ],
  [
    'POST /api/invitations',
    () => invitationsPost(jsonReq({ email: 'nouveau@resto.test', role: 'waiter' })),
  ],
  ['POST /api/invitations/[id]/resend', () => resendPost(jsonReq({}), routeCtx)],
  [
    'PUT /api/permissions',
    () =>
      permissionsPut(
        jsonReq({ role: 'waiter', permissions: { [PERMISSION_CODES[0]]: true } }, 'PUT'),
      ),
  ],
  [
    'POST /api/assignments',
    () =>
      assignmentsPost(
        jsonReq({
          table_id: '33333333-3333-4333-a333-333333333333',
          server_id: '44444444-4444-4444-a444-444444444444',
        }),
      ),
  ],
];

describe('restaurant coupe: aucune ecriture admin par API (A-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertServing.mockReset();
    mockAssertServing.mockRejectedValue(new TenantLockedError());
  });

  it.each(lockedWrites)('%s: 403 + message de coupure, rien n est ecrit', async (_n, run) => {
    const res = await run();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(LOCK_MESSAGE);
    expect(mockAssertServing).toHaveBeenCalledWith(T);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('TEMOIN: DELETE /api/invitations/[id] (revoquer) reste permis restaurant coupe', async () => {
    const res = await invitationDelete(jsonReq({}, 'DELETE'), routeCtx);
    expect(res.status).toBe(200);
    expect(writeSpy).toHaveBeenCalledWith(INV_ID);
    expect(mockAssertServing).not.toHaveBeenCalled();
  });

  it('TEMOIN: DELETE /api/permissions (revoquer) reste permis restaurant coupe', async () => {
    const res = await permissionsDelete(jsonReq({ role: 'waiter' }, 'DELETE'));
    expect(res.status).not.toBe(403);
    expect(mockAssertServing).not.toHaveBeenCalled();
  });

  it('TEMOIN: restaurant qui sert, la meme ecriture passe (la garde ne bloque pas tout)', async () => {
    mockAssertServing.mockResolvedValue(undefined);
    const res = await permissionsPut(
      jsonReq({ role: 'waiter', permissions: { [PERMISSION_CODES[0]]: true } }, 'PUT'),
    );
    expect(res.status).toBe(200);
    expect(writeSpy).toHaveBeenCalled();
  });
});

// Toute route d'ecriture de src/app/api est classee: gardee, ouverte (avec
// raison) ou hors perimetre. Une nouvelle route non classee fait echouer ce test.
describe('classement de toutes les routes API', () => {
  const GUARDED = [
    'upload',
    'menu-import',
    'menu-import-pdf',
    'recipe-import',
    'supplier-import',
    'invitations',
    'invitations/[id]/resend',
    'permissions',
    'assignments',
    'assignments/release-all',
    'assignments/[id]',
    'orders/[id]/claim',
    'stock-alerts/check',
    'admin/reset',
    // Verrou propre, deja en place avant A-02.
    'orders/mutations',
    'orders/pos',
  ];
  const OPEN = [
    // Revoquer = sortie de securite.
    'invitations/[id]',
    // Lecture DNS seule, ecrit rien (le domaine est enregistre par un reglage garde).
    'domain-verify',
    // PDF genere a la volee, ecrit rien.
    'supports/export',
    // Integration d'un NOUVEL etablissement (essai en cours, jamais coupe).
    'onboarding/save',
    'onboarding/complete',
    'onboarding/state',
    'restaurants/create',
    // Etat personnel de l'appelant (appareil push).
    'push-subscriptions',
    // Invalide un cache, n'ecrit aucune donnee.
    'revalidate-menu',
    // Facturation: necessaire pour payer et rouvrir.
    'billing-portal',
    'create-checkout-session',
    'create-embedded-checkout',
    'update-subscription',
    'verify-checkout',
    'invoices',
    'webhooks/stripe',
    'cron/freeze-expired-trials',
    'cron/reconcile-payments',
    'dev/simulate-subscription',
    // Publiques / authentification / convive.
    'auth/[...supabase]',
    'auth/signout',
    'login',
    'signup',
    'signup-oauth',
    'forgot-password',
    'resend-confirmation',
    'invitations/accept',
    'invitations/validate',
    'coupons/validate',
    'menu-search',
    'orders',
    'orders/preview',
    'health',
    'version',
  ];

  function routes(dir: string, base = ''): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        return name === '__tests__' ? [] : routes(full, base ? `${base}/${name}` : name);
      }
      return name === 'route.ts' ? [base] : [];
    });
  }

  it('aucune route non classee', () => {
    const found = routes(join(process.cwd(), 'src/app/api'));
    const known = new Set([...GUARDED, ...OPEN]);
    expect(found.filter((r) => !known.has(r))).toEqual([]);
    expect([...known].filter((r) => !found.includes(r))).toEqual([]);
  });

  it('chaque route gardee appelle la garde dans sa source', () => {
    const missing = GUARDED.filter((r) => {
      const src = readFileSync(join(process.cwd(), 'src/app/api', r, 'route.ts'), 'utf8');
      return !/assertTenantServing|tenantLockResponse|tenantLockReason/.test(src);
    });
    expect(missing).toEqual([]);
  });
});
