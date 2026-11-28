// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useOnboarding } from '@/components/onboarding/use-onboarding';

// Audit d'equipe du 2026-11-27 (onboarding #20): la progression ne vivait que
// dans l'etat React. Le bouton retour du telephone quittait l'onboarding entier
// au lieu de revenir d'un ecran.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function loadOnFirstStep() {
  const hook = renderHook(() => useOnboarding());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return hook;
}

describe('useOnboarding - bouton retour du telephone', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/onboarding/state')
          ? jsonResponse({
              tenantId: 't1',
              tenantSlug: 'chez-awa',
              tenantName: 'Chez Awa',
              step: 1,
              data: { _phase: 1, _subScreen: 0, tenantName: 'Chez Awa' },
            })
          : jsonResponse({ success: true }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function pop(state: unknown): void {
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state }));
    });
  }

  it('chaque ecran affiche pose une entree d historique avec sa position', async () => {
    const hook = await loadOnFirstStep();
    const before = window.history.length;
    act(() => hook.result.current.goNext());
    expect(window.history.length).toBe(before + 1);
    expect(window.history.state).toMatchObject({
      attablOnboardingStep: {
        phase: hook.result.current.phase,
        subScreen: hook.result.current.subScreen,
      },
    });
  });

  it('retour puis suivant du navigateur: on revient exactement ou l on etait', async () => {
    const hook = await loadOnFirstStep();
    const first = { phase: hook.result.current.phase, subScreen: hook.result.current.subScreen };
    act(() => hook.result.current.goNext());
    const second = { phase: hook.result.current.phase, subScreen: hook.result.current.subScreen };
    const secondKey = hook.result.current.screenKey;

    pop({ attablOnboardingStep: first });
    expect(hook.result.current.phase).toBe(first.phase);
    expect(hook.result.current.subScreen).toBe(first.subScreen);

    // Bouton Suivant du navigateur: il ne doit PAS faire reculer encore.
    pop({ attablOnboardingStep: second });
    expect(hook.result.current.screenKey).toBe(secondKey);
  });

  it('un retour du navigateur n ajoute pas d entree (pas de boucle)', async () => {
    const hook = await loadOnFirstStep();
    const first = { phase: hook.result.current.phase, subScreen: hook.result.current.subScreen };
    act(() => hook.result.current.goNext());
    const length = window.history.length;
    pop({ attablOnboardingStep: first });
    expect(window.history.length).toBe(length);
  });

  it('le bouton Retour de l ecran et le saut d etape ajoutent une entree (le retour les annule)', async () => {
    const hook = await loadOnFirstStep();
    act(() => hook.result.current.goNext());
    const length = window.history.length;
    act(() => hook.result.current.goPrev());
    expect(window.history.length).toBe(length + 1);
  });

  it('une entree etrangere a l onboarding ne change rien (temoin)', async () => {
    const hook = await loadOnFirstStep();
    act(() => hook.result.current.goNext());
    const key = hook.result.current.screenKey;
    pop(null);
    expect(hook.result.current.screenKey).toBe(key);
  });
});
