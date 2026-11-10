import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * X17: la cloche est montree a toute l'equipe, mais seuls owner/admin/manager
 * pouvaient marquer une notification lue. Pour la caisse, la cuisine et la
 * salle, le badge ne se vidait jamais (refus avale par useNotifications).
 * Vraie garde (get-session); seul le client Supabase est simule.
 *
 * Effet de bord corrige ensuite: une notification diffusee (user_id NULL) avait
 * UN drapeau `read` pour tout le restaurant. Le serveur qui vidait sa cloche la
 * vidait pour le proprietaire. "Lu" est maintenant par personne: l'action
 * n'ecrit QUE dans notification_reads, au nom de l'appelant.
 */

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const NOTIF_ID = '55555555-5555-4555-a555-555555555555';
const member = { role: 'waiter' };
const mockUpdate = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1', email: 'a@b.c' } } }) },
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is']) c[m] = vi.fn(() => c);
      c.single = vi.fn(async () => ({
        data: { id: 'admin-1', tenant_id: TENANT_ID, role: member.role, custom_permissions: null },
        error: null,
      }));
      c.upsert = vi.fn(async (rows: unknown, opts: unknown) => {
        mockUpsert(table, rows, opts);
        return { error: null };
      });
      c.update = vi.fn((payload: unknown) => {
        mockUpdate(table, payload);
        const r: Record<string, unknown> = {};
        r.eq = vi.fn(() => r);
        r.in = vi.fn(() => r);
        r.then = (ok: (v: { error: null }) => unknown) => ok({ error: null });
        return r;
      });
      return c;
    },
  })),
}));

beforeEach(() => vi.clearAllMocks());

describe('notifications: tout membre vide sa cloche, pour lui seul', () => {
  it.each(['waiter', 'chef', 'cashier'])('%s marque une notification lue', async (role) => {
    member.role = role;
    const { actionMarkNotificationRead } = await import('@/app/actions/notifications');
    const res = await actionMarkNotificationRead(TENANT_ID, NOTIF_ID);
    expect(res.success).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith(
      'notification_reads',
      [{ notification_id: NOTIF_ID, user_id: 'u-1', tenant_id: TENANT_ID }],
      { onConflict: 'notification_id,user_id', ignoreDuplicates: true },
    );
  });

  it('serveur: "tout marquer comme lu" ne touche PAS au drapeau partage', async () => {
    member.role = 'waiter';
    const { actionMarkAllNotificationsRead } = await import('@/app/actions/notifications');
    const res = await actionMarkAllNotificationsRead(TENANT_ID, [NOTIF_ID]);
    expect(res.success).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(
      'notification_reads',
      [{ notification_id: NOTIF_ID, user_id: 'u-1', tenant_id: TENANT_ID }],
      expect.anything(),
    );
  });
});
