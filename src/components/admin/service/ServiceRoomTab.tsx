'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function RoomTab({
  active,
  onClick,
  label,
  count,
  dotClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: string;
  dotClass?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        'h-auto relative top-px flex items-center gap-2 rounded-none rounded-t-sm border border-b-0 border-transparent px-3.5 py-2 text-xs whitespace-nowrap transition-colors',
        active
          ? 'border-app-border bg-app-card text-app-text'
          : 'text-app-text-muted hover:text-app-text',
      )}
    >
      {dotClass && <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />}
      {label}
      {count && (
        <span
          className={cn(
            'rounded-sm px-1.5 py-px font-mono text-[10px]',
            active ? 'bg-app-elevated text-app-text-secondary' : 'bg-app-bg text-app-text-muted',
          )}
        >
          {count}
        </span>
      )}
    </Button>
  );
}
