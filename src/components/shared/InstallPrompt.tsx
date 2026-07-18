'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// beforeinstallprompt is not in the standard lib DOM types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'attabl-install-dismissed';

// Module-level early capture: on a slow tablet Chrome can fire
// beforeinstallprompt while the heavy admin shell is still hydrating, before
// any useEffect listener exists - the event would be lost for the whole page
// load. Capturing at module evaluation narrows that window to almost nothing.
let earlyCaptured: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    earlyCaptured = e as BeforeInstallPromptEvent;
  });
}

/**
 * Dismissible "install this app" prompt. Appears only when the browser fires
 * beforeinstallprompt (installable, not already installed) and the user has not
 * dismissed it before. Uses the accent Button, whose token resolves per shell
 * (blue in admin, brand lime in the storefront), so no hardcoded color and no
 * admin-lime violation. Styling uses app-* tokens so it adapts to light/dark.
 *
 * className lets each mount offset itself above any fixed bottom bar (e.g. the
 * admin bottom-nav) so two fixed elements never overlap.
 */
export function InstallPrompt({ className, label }: { className?: string; label: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Already installed (standalone) or previously dismissed: never show.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      // localStorage blocked: fall through, the prompt is best-effort.
    }

    // Pick up an event that fired before this component mounted (early capture).
    // Deferred to a microtask so the effect does not set state synchronously.
    if (earlyCaptured) {
      const captured = earlyCaptured;
      earlyCaptured = null;
      queueMicrotask(() => setDeferred(captured));
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      // Re-check dismissal here, not just at mount: the browser can fire this
      // again later in the same session, and a dismissed prompt must stay gone.
      try {
        if (localStorage.getItem(DISMISS_KEY) === '1') return;
      } catch {
        // localStorage blocked: show rather than silently never offering install.
      }
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore: dismissal just won't persist across reloads.
    }
    setDeferred(null);
  };

  const install = async () => {
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      // The prompt can only be used once; drop it either way.
    }
    setDeferred(null);
  };

  return (
    <div
      className={cn(
        'fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-app-border bg-app-elevated p-3 shadow-lg sm:inset-x-auto sm:right-4',
        className,
      )}
      role="region"
      aria-label={label}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-app-hover">
        <Download className="h-4 w-4 text-app-text-secondary" aria-hidden />
      </div>
      <p className="flex-1 text-sm text-app-text">{label}</p>
      <Button size="sm" onClick={install} className="h-9 shrink-0">
        Installer
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={dismiss}
        aria-label="Fermer"
        className="h-9 w-9 shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
