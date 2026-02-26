// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts, type ShortcutDefinition } from '../useKeyboardShortcuts';

// ─── Helpers ────────────────────────────────────────────

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}, target?: HTMLElement) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    ...opts,
  });
  (target ?? document).dispatchEvent(event);
}

function makeShortcut(overrides: Partial<ShortcutDefinition> & { id: string }): ShortcutDefinition {
  return {
    label: overrides.id,
    section: 'contextual',
    keys: ['x'],
    action: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────

describe('useKeyboardShortcuts', () => {
  const onOpenHelp = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onOpenHelp.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens help when ? is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ shortcuts: [], onOpenHelp }));

    fireKey('?');
    expect(onOpenHelp).toHaveBeenCalledOnce();
  });

  it('does NOT open help when ? is pressed inside an input', () => {
    renderHook(() => useKeyboardShortcuts({ shortcuts: [], onOpenHelp }));

    const input = document.createElement('input');
    document.body.appendChild(input);

    fireKey('?', {}, input);
    expect(onOpenHelp).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('does NOT open help when ? is pressed inside a textarea', () => {
    renderHook(() => useKeyboardShortcuts({ shortcuts: [], onOpenHelp }));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    fireKey('?', {}, textarea);
    expect(onOpenHelp).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it('does NOT intercept Cmd+K (lets CommandPalette handle it)', () => {
    const action = vi.fn();
    const shortcut = makeShortcut({ id: 'test', keys: ['k'], modifier: true });
    shortcut.action = action;

    renderHook(() => useKeyboardShortcuts({ shortcuts: [shortcut], onOpenHelp }));

    fireKey('k', { metaKey: true });
    expect(action).not.toHaveBeenCalled();
    expect(onOpenHelp).not.toHaveBeenCalled();
  });

  it('handles Go-sequence (g then d) for navigation', () => {
    const action = vi.fn();
    const navShortcut = makeShortcut({
      id: 'nav-dashboard',
      section: 'navigation',
      keys: ['g', 'd'],
    });
    navShortcut.action = action;

    renderHook(() => useKeyboardShortcuts({ shortcuts: [navShortcut], onOpenHelp }));

    // Press g
    fireKey('g');
    // Press d within timeout
    fireKey('d');

    expect(action).toHaveBeenCalledOnce();
  });

  it('Go-sequence times out after 1 second', () => {
    const action = vi.fn();
    const navShortcut = makeShortcut({
      id: 'nav-dashboard',
      section: 'navigation',
      keys: ['g', 'd'],
    });
    navShortcut.action = action;

    renderHook(() => useKeyboardShortcuts({ shortcuts: [navShortcut], onOpenHelp }));

    // Press g
    fireKey('g');
    // Wait more than 1 second
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    // Press d after timeout
    fireKey('d');

    expect(action).not.toHaveBeenCalled();
  });

  it('triggers contextual single-key shortcuts', () => {
    const action = vi.fn();
    const shortcut = makeShortcut({
      id: 'kds-advance',
      section: 'contextual',
      keys: ['n'],
    });
    shortcut.action = action;

    renderHook(() => useKeyboardShortcuts({ shortcuts: [shortcut], onOpenHelp }));

    fireKey('n');
    expect(action).toHaveBeenCalledOnce();
  });

  it('ignores contextual shortcuts when modifier is held', () => {
    const action = vi.fn();
    const shortcut = makeShortcut({
      id: 'kds-advance',
      section: 'contextual',
      keys: ['n'],
    });
    shortcut.action = action;

    renderHook(() => useKeyboardShortcuts({ shortcuts: [shortcut], onOpenHelp }));

    fireKey('n', { metaKey: true });
    expect(action).not.toHaveBeenCalled();
  });

  it('does not fire shortcuts when contentEditable is focused', () => {
    renderHook(() => useKeyboardShortcuts({ shortcuts: [], onOpenHelp }));

    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);

    fireKey('?', {}, div);
    expect(onOpenHelp).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('does not fire shortcuts when cmdk-input is focused', () => {
    renderHook(() => useKeyboardShortcuts({ shortcuts: [], onOpenHelp }));

    const input = document.createElement('input');
    input.setAttribute('cmdk-input', '');
    document.body.appendChild(input);

    fireKey('?', {}, input);
    expect(onOpenHelp).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('focuses [data-search-input] when / is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ shortcuts: [], onOpenHelp }));

    const searchInput = document.createElement('input');
    searchInput.setAttribute('data-search-input', '');
    document.body.appendChild(searchInput);

    const focusSpy = vi.spyOn(searchInput, 'focus');
    fireKey('/');
    expect(focusSpy).toHaveBeenCalledOnce();

    document.body.removeChild(searchInput);
  });
});
