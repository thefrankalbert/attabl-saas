'use client';

import { useEffect, useRef, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────

export interface ShortcutDefinition {
  /** Unique key for deduplication */
  id: string;
  /** Display label (i18n key or raw text) */
  label: string;
  /** Section for grouping in help modal */
  section: 'global' | 'navigation' | 'contextual';
  /** The key(s) that trigger this shortcut */
  keys: string[];
  /** Handler function */
  action: () => void;
  /** Whether this requires a modifier (Cmd/Ctrl) */
  modifier?: boolean;
}

// ─── Helpers ────────────────────────────────────────────

export function getOS(): 'mac' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'mac' : 'other';
}

export function getModifierSymbol(): string {
  return getOS() === 'mac' ? '⌘' : 'Ctrl';
}

// ─── Input guard ────────────────────────────────────────

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;

  const tagName = target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (target.isContentEditable) return true;

  // cmdk input (CommandPalette)
  if (target.hasAttribute('cmdk-input')) return true;

  return false;
}

// ─── Hook ───────────────────────────────────────────────

interface UseKeyboardShortcutsOptions {
  shortcuts: ShortcutDefinition[];
  onOpenHelp: () => void;
}

export function useKeyboardShortcuts({ shortcuts, onOpenHelp }: UseKeyboardShortcutsOptions) {
  const goPrefix = useRef<boolean>(false);
  const goTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearGoState = useCallback(() => {
    goPrefix.current = false;
    if (goTimeout.current) {
      clearTimeout(goTimeout.current);
      goTimeout.current = null;
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K guard — let CommandPalette handle it
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') return;

      // Input guard — don't intercept when user is typing
      if (isEditableTarget(e.target)) return;

      // Ignore if any modifier is held (except for modifier shortcuts)
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;

      // ── Go-sequence: second key ──
      if (goPrefix.current) {
        const key = e.key.toLowerCase();
        clearGoState();

        const navShortcut = shortcuts.find(
          (s) =>
            s.section === 'navigation' && s.keys.length === 2 && s.keys[1].toLowerCase() === key,
        );
        if (navShortcut) {
          e.preventDefault();
          navShortcut.action();
          return;
        }
        // No match — fall through (key is consumed by go-sequence attempt)
        return;
      }

      // ── Go-sequence: first key (g) ──
      if (e.key === 'g' && !hasModifier) {
        goPrefix.current = true;
        goTimeout.current = setTimeout(() => {
          goPrefix.current = false;
        }, 1000);
        return;
      }

      // ── Single keys ──

      // ? → open help
      if (e.key === '?' && !hasModifier) {
        e.preventDefault();
        onOpenHelp();
        return;
      }

      // / → focus search
      if (e.key === '/' && !hasModifier) {
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          return;
        }
      }

      // ── Contextual single-key shortcuts ──
      if (!hasModifier) {
        const match = shortcuts.find(
          (s) =>
            s.section === 'contextual' && !s.modifier && s.keys.length === 1 && s.keys[0] === e.key,
        );
        if (match) {
          e.preventDefault();
          match.action();
          return;
        }
      }

      // ── Modifier shortcuts ──
      if (hasModifier) {
        const match = shortcuts.find(
          (s) =>
            s.modifier && s.keys.length === 1 && s.keys[0].toLowerCase() === e.key.toLowerCase(),
        );
        if (match) {
          e.preventDefault();
          match.action();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (goTimeout.current) clearTimeout(goTimeout.current);
    };
  }, [shortcuts, onOpenHelp, clearGoState]);
}
