// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr-FR.json';

/**
 * Contre-audit 4: aucun envoi de l'inscription sous 12 caracteres (ni avec une
 * regle manquante), et la phrase est celle de l'application, traduite, au lieu
 * de la bulle native du navigateur.
 */
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {} }) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/offline/browser-logout-cleanup', () => ({
  prepareLogoutInBrowser: vi.fn(async () => undefined),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { useAuthForm } from '../useAuthForm';

const fetchMock = vi.fn();

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="fr-FR" messages={fr}>
      {children}
    </NextIntlClientProvider>
  );
}

async function submitSignup(password: string) {
  const { result } = renderHook(() => useAuthForm('signup'), { wrapper });
  act(() => {
    result.current.setRestaurant('Chez Awa');
    result.current.setEmail('awa@resto.test');
    result.current.setPassword(password);
  });
  await act(async () => {
    await result.current.handleSubmit({ preventDefault: () => undefined } as React.FormEvent);
  });
  return result.current.error;
}

describe('useAuthForm: blocage de l envoi sous les regles du mot de passe', () => {
  beforeEach(() => {
    fetchMock
      .mockReset()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, emailDelivered: true }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('11 caracteres: aucun envoi, phrase traduite qui nomme ce qui manque', async () => {
    const error = await submitSignup('Maquis-2026');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toBe('Il manque : 12 caractères.');
  });

  it('temoin: un mot de passe conforme part vers /api/signup', async () => {
    await submitSignup('Maquis-2026!Awa');
    expect(fetchMock).toHaveBeenCalledWith('/api/signup', expect.anything());
  });
});
