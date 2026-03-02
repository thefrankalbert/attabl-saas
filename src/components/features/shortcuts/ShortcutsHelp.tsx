'use client';

import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { getModifierSymbol, type ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';

// ─── Types ──────────────────────────────────────────────

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: ShortcutDefinition[];
}

// ─── Kbd badge ──────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-app-elevated border border-app-border rounded-md text-xs font-mono font-medium text-app-text-secondary">
      {children}
    </kbd>
  );
}

// ─── Key display ────────────────────────────────────────

function ShortcutKeys({ shortcut }: { shortcut: ShortcutDefinition }) {
  const t = useTranslations('shortcuts');

  if (shortcut.modifier) {
    return (
      <span className="flex items-center gap-1">
        <Kbd>{getModifierSymbol()}</Kbd>
        <Kbd>{shortcut.keys[0].toUpperCase()}</Kbd>
      </span>
    );
  }

  // Go-sequence (2 keys)
  if (shortcut.keys.length === 2) {
    return (
      <span className="flex items-center gap-1">
        <Kbd>{shortcut.keys[0].toUpperCase()}</Kbd>
        <span className="text-[10px] text-app-text-muted">{t('then')}</span>
        <Kbd>{shortcut.keys[1].toUpperCase()}</Kbd>
      </span>
    );
  }

  // Single key
  return (
    <Kbd>
      {shortcut.keys[0] === '?'
        ? '?'
        : shortcut.keys[0] === '/'
          ? '/'
          : shortcut.keys[0].toUpperCase()}
    </Kbd>
  );
}

// ─── Component ──────────────────────────────────────────

export function ShortcutsHelp({ open, onOpenChange, shortcuts }: ShortcutsHelpProps) {
  const t = useTranslations('shortcuts');
  const modifier = getModifierSymbol();

  const globalShortcuts: ShortcutDefinition[] = [
    // Static global entries (not from registered shortcuts)
    {
      id: 'cmd-k',
      label: t('commandPalette'),
      section: 'global',
      keys: ['K'],
      action: () => {},
      modifier: true,
    },
    { id: 'help', label: t('openHelp'), section: 'global', keys: ['?'], action: () => {} },
    { id: 'search', label: t('focusSearch'), section: 'global', keys: ['/'], action: () => {} },
  ];

  const navShortcuts = shortcuts.filter((s) => s.section === 'navigation');
  const contextualShortcuts = shortcuts.filter((s) => s.section === 'contextual');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Global */}
          <Section title={t('sectionGlobal')}>
            {globalShortcuts.map((s) => (
              <ShortcutRow key={s.id} shortcut={s} />
            ))}
          </Section>

          {/* Navigation */}
          {navShortcuts.length > 0 && (
            <Section title={t('sectionNavigation')}>
              {navShortcuts.map((s) => (
                <ShortcutRow key={s.id} shortcut={s} />
              ))}
            </Section>
          )}

          {/* Contextual */}
          {contextualShortcuts.length > 0 && (
            <Section title={t('sectionContextual')}>
              {contextualShortcuts.map((s) => (
                <ShortcutRow key={s.id} shortcut={s} />
              ))}
            </Section>
          )}
        </div>

        <p className="text-[11px] text-app-text-muted mt-3 text-center">
          {t('modifierNote', { modifier })}
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ─────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ShortcutRow({ shortcut }: { shortcut: ShortcutDefinition }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-app-text-secondary">{shortcut.label}</span>
      <ShortcutKeys shortcut={shortcut} />
    </div>
  );
}
