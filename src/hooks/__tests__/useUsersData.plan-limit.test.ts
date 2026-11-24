// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Decision du proprietaire du 2026-11-21: une invitation au-dela de la limite
 * du plan est refusee par le serveur (code PLAN_LIMIT), et l'ecran Equipe
 * affiche alors un bandeau qui propose le plan superieur, au lieu d'une simple
 * notification qui disparait.
 */

const toast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('@/app/actions/admin', () => ({
  actionDeleteAdminUser: vi.fn(),
  actionUpdateAdminUser: vi.fn(),
}));

import { useUsersData } from '../useUsersData';

function reponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useUsersData - refus pour limite du plan', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    toast.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function inviter(body: unknown, status = 400) {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'POST' ? reponse(status, body) : reponse(200, { invitations: [] }),
      ),
    );
    const { result } = renderHook(() =>
      useUsersData({
        tenantId: 't-1',
        currentUserRole: 'owner',
        initialUsers: [],
        confirm: vi.fn(),
      }),
    );
    act(() => result.current.setInviteEmail('cook@test.local'));
    await act(async () => {
      await result.current.handleSendInvitation();
    });
    return result;
  }

  it('un refus PLAN_LIMIT ouvre le bandeau, sans notification d erreur', async () => {
    const result = await inviter({ error: 'Limite atteinte : 3 membres.', code: 'PLAN_LIMIT' });
    expect(result.current.planLimitMessage).toBe('Limite atteinte : 3 membres.');
    expect(toast).not.toHaveBeenCalled();
  });

  it('une autre erreur reste une notification, sans bandeau', async () => {
    const result = await inviter({ error: 'Adresse deja membre.' });
    expect(result.current.planLimitMessage).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});
