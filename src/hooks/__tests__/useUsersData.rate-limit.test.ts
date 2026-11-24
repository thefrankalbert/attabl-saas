// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Verification visuelle du lot B2b-2 (defaut 8): sur un refus 429, l'ecran
 * Equipe affichait le texte brut du serveur, sans accents ("Trop de requetes.
 * Reessayez plus tard."), ou "Erreur inconnue" pour le renvoi et l'annulation.
 * Le message vient maintenant des traductions (`errors.rateLimited`).
 */

const toast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));
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

const RAW = { error: 'Trop de requetes. Reessayez plus tard.' };

describe('useUsersData - limite de debit (429)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    toast.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'POST' || init?.method === 'DELETE'
          ? reponse(429, RAW)
          : reponse(200, { invitations: [] }),
      ),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function hook() {
    return renderHook(() =>
      useUsersData({
        tenantId: 't-1',
        currentUserRole: 'owner',
        initialUsers: [],
        confirm: vi.fn(),
      }),
    ).result;
  }

  const attendu = expect.objectContaining({
    description: 'errors.rateLimited',
    variant: 'destructive',
  });

  it('invitation: message traduit, jamais le texte brut du serveur', async () => {
    const result = hook();
    act(() => result.current.setInviteEmail('cook@test.local'));
    await act(async () => {
      await result.current.handleSendInvitation();
    });
    expect(toast).toHaveBeenCalledWith(attendu);
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ description: RAW.error }));
  });

  it('renvoi: message de limite, pas "erreur inconnue"', async () => {
    const result = hook();
    await act(async () => {
      await result.current.handleResendInvitation('inv-1');
    });
    expect(toast).toHaveBeenCalledWith(attendu);
  });

  it('annulation: message de limite, pas "erreur inconnue"', async () => {
    const result = hook();
    await act(async () => {
      await result.current.handleCancelInvitation('inv-1');
    });
    expect(toast).toHaveBeenCalledWith(attendu);
  });
});
