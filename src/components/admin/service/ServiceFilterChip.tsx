'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function FilterChip({
  active,
  onClick,
  dotClass,
  label,
}: {
  active: boolean;
  onClick: () => void;
  dotClass: string;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        'h-auto inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors',
        active
          ? 'border-app-border bg-app-elevated text-app-text'
          : 'border-app-border/60 text-app-text-muted hover:bg-app-hover hover:text-app-text',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
      {label}
    </Button>
  );
}
