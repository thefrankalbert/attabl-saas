// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useOnboarding } from '@/components/onboarding/use-onboarding';

/**
 * Audit C-012: the menu step could be passed with no dish, launching the
 * restaurant with an empty menu. The first "Continuer" now warns; a second one
 * goes on (a deliberate choice).
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let menuItems: Array<{ name: string; price: number; category: string }>;

async function loadOnMenuScreen() {
  const hook = renderHook(() => useOnboarding());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  // Walk forward until the menu screen (phase 2, last sub-screen).
  for (let i = 0; i < 5 && hook.result.current.screenKey !== 'menu'; i++) {
    act(() => hook.result.current.goNext());
  }
  expect(hook.result.current.screenKey).toBe('menu');
  return hook;
}

describe('useOnboarding - empty menu (C-012)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    menuItems = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/onboarding/state')
          ? jsonResponse({
              tenantId: 't1',
              tenantSlug: 'chez-awa',
              tenantName: 'Chez Awa',
              step: 2,
              data: { _phase: 2, _subScreen: 0, tenantName: 'Chez Awa', menuItems },
            })
          : jsonResponse({ success: true }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('warns on the first Continue with an empty menu, then lets the owner go on', async () => {
    const hook = await loadOnMenuScreen();

    act(() => hook.result.current.goNext());
    expect(hook.result.current.screenKey).toBe('menu');
    expect(hook.result.current.error).toBe('emptyMenuWarning');

    act(() => hook.result.current.goNext());
    expect(hook.result.current.screenKey).not.toBe('menu');
  });

  it('does not warn when the menu has a dish', async () => {
    menuItems = [{ name: 'Riz gras', price: 2000, category: 'Plats' }];
    const hook = await loadOnMenuScreen();

    act(() => hook.result.current.goNext());
    expect(hook.result.current.screenKey).not.toBe('menu');
  });
});
