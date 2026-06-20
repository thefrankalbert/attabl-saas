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
        'hidden h-8 min-w-0 max-w-[380px] flex-1 items-center justify-start gap-2 rounded-[0.625rem] border border-[var(--border)] bg-[var(--background)] px-2.5 text-[13px] font-normal text-[var(--muted-foreground)] shadow-none hover:bg-[var(--accent)] hover:text-[var(--foreground)] md:inline-flex',
        className,
      )}
    >
      <Search className="size-[15px] shrink-0" />
      <span className="flex-1 truncate text-left">{tc('placeholder')}</span>
      <span className="rounded-[5px] border border-[var(--border)] px-[5px] py-px font-mono text-[11px] text-[var(--muted-foreground)]">
        ⌘K
      </span>
    </Button>
  );
}
