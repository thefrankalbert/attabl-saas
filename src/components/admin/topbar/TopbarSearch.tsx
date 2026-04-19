'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Topbar search button.
 * Visually matches Dashboard.html lines 131-143 (search + kbd shortcut).
 * Clicking triggers a synthetic Cmd+K keydown picked up by the global
 * CommandPalette listener (src/components/features/command-palette/
 * CommandPalette.tsx:35-44).
 */
export function TopbarSearch({ className }: { className?: string }) {
  const tc = useTranslations('commandPalette');

  const openPalette = () => {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={openPalette}
      className={cn(
        'hidden md:inline-flex items-center justify-start gap-2 h-auto px-2.5 py-[5px] rounded-md border border-app-border bg-app-card text-[12px] font-normal text-app-text-muted hover:bg-app-elevated hover:text-app-text-secondary transition-colors w-[220px] shadow-none',
        className,
      )}
    >
      <Search className="w-3 h-3 shrink-0" />
      <span className="flex-1 truncate text-left">{tc('placeholder')}</span>
      <span className="font-mono text-[10px] px-1.5 py-px rounded border border-app-border text-app-text-muted">
        ⌘K
      </span>
    </Button>
  );
}
