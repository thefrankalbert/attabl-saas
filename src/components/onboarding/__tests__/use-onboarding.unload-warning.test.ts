// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useOnboarding } from '@/components/onboarding/use-onboarding';

/**
 * The browser "Quitter le site ?" prompt must only appear when leaving would
 * lose something. It used to appear on every exit, even with the draft saved.
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function leavePage(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** Draft position restored from the server, and the status of every save. */
let restored: { _phase: number; _subScreen: number };
let saveStatus: number;

async function loadStudio() {
  const hook = renderHook(() => useOnboarding());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(hook.result.current.loading).toBe(false);
  return hook;
}

/** Past the 2 s auto-save debounce, then past the "saved" fade (2 s). */
async function waitForAutoSave() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2100);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2100);
  });
}

describe('useOnboarding - leave warning', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    restored = { _phase: 1, _subScreen: 0 };
    saveStatus = 200;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/onboarding/state')) {
          return jsonResponse({
            tenantId: 't1',
            tenantSlug: 'chez-awa',
            tenantName: 'Chez Awa',
            step: 1,
            data: restored,
          });
        }
        return saveStatus === 200
          ? jsonResponse({ success: true })
          : jsonResponse({ error: 'Unauthorized' }, saveStatus);
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not warn right after the draft is loaded', async () => {
    await loadStudio();
    expect(leavePage()).toBe(false);
  });

  it('does not warn once the draft is saved, warns again after an unsaved edit', async () => {
    const { result } = await loadStudio();
    await waitForAutoSave();
    expect(leavePage()).toBe(false);

    // A new edit not yet saved (debounce pending): leaving would lose it.
    act(() => {
      result.current.updateData({ city: 'Ouagadougou' });
    });
    expect(leavePage()).toBe(true);
  });

  it('does not warn on the recap screen when nothing was edited', async () => {
    // The recap (last screen of phase 3) does not auto-save.
    restored = { _phase: 3, _subScreen: 1 };
    const { result } = await loadStudio();
    expect(result.current.isLastScreen).toBe(true);
    await waitForAutoSave();
    expect(leavePage()).toBe(false);
  });

  it('does not warn after moving to another screen with the data saved', async () => {
    const { result } = await loadStudio();
    await waitForAutoSave();
    act(() => {
      result.current.goNext();
    });
    // Position not yet auto-saved: no entered data is at stake.
    expect(leavePage()).toBe(false);
  });

  it('still warns when the save was refused (session expired)', async () => {
    saveStatus = 401;
    const { result } = await loadStudio();
    act(() => {
      result.current.updateData({ city: 'Ouagadougou' });
    });
    await waitForAutoSave();
    expect(leavePage()).toBe(true);
  });
});
