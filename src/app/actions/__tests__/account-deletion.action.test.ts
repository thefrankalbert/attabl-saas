import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceError } from '@/services/errors';

// Apres une suppression reussie, la redirection DOIT etre faite par le serveur
// vers /login?deleted=true: sinon la reponse de l'action re-rend la page admin,
// dont le layout (plus de session, ou restaurant ferme) renvoie vers /login
// SANS le bandeau de confirmation (constate au banc local le 2026-11-17).

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const signOut = vi.fn(async () => ({ error: null }));
const closeOwnerRestaurant = vi.fn();
const deleteStaffAccount = vi.fn();
let headerSlug: string | null = 'alpha';

vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(headerSlug ? { 'x-tenant-slug': headerSlug } : {}),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u-1', email: 'a@x.test' } }, error: null }),
      signOut,
    },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/stripe/server', () => ({ stripe: {} }));
vi.mock('@/lib/rate-limit', () => ({
  adminResetLimiter: { check: async () => ({ success: true }) },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/services/account-deletion.service', () => ({
  createAccountDeletionService: () => ({ closeOwnerRestaurant, deleteStaffAccount }),
}));

const { actionDeleteOwnerAccount, actionDeleteStaffAccount } = await import('../account-deletion');

describe('account deletion actions', () => {
  beforeEach(() => {
    redirect.mockClear();
    signOut.mockClear();
    closeOwnerRestaurant.mockReset();
    deleteStaffAccount.mockReset();
    headerSlug = 'alpha';
  });

  it('owner: signs out then redirects server-side to /login?deleted=true', async () => {
    closeOwnerRestaurant.mockResolvedValue({ alreadyClosed: false });
    await expect(actionDeleteOwnerAccount({ confirmation: 'Chez alpha' })).rejects.toThrow(
      /NEXT_REDIRECT:.*\/login\?deleted=true$/,
    );
    expect(signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('staff: same redirect, even without a tenant (e.g. from /unauthorized)', async () => {
    headerSlug = null;
    deleteStaffAccount.mockResolvedValue(undefined);
    await expect(actionDeleteStaffAccount({ confirmation: 'SUPPRIMER' })).rejects.toThrow(
      /NEXT_REDIRECT:.*\/login\?deleted=true$/,
    );
    expect(deleteStaffAccount).toHaveBeenCalledWith({ userId: 'u-1', confirmation: 'SUPPRIMER' });
  });

  it('failure: returns an error code, no sign-out, no redirect', async () => {
    deleteStaffAccount.mockRejectedValue(new ServiceError('x', 'VALIDATION'));
    const res = await actionDeleteStaffAccount({ confirmation: 'oops' });
    expect(res).toEqual({ success: false, error: 'mismatch' });
    expect(signOut).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
