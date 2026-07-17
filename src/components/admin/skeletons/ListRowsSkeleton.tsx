import { cn } from '@/lib/utils';

interface ListRowsSkeletonProps {
  rows?: number;
  className?: string;
}

/**
 * Generic row-list skeleton for admin data views (stock history, invoices,
 * audit log, losses...). Each row mirrors a card row: leading icon, two text
 * lines, trailing value. Shown while the list data loads, in place of a spinner.
 */
export function ListRowsSkeleton({ rows = 6, className }: ListRowsSkeletonProps) {
  return (
    <div className={cn('w-full animate-pulse space-y-2.5', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-app-border/60 bg-app-card px-4 py-3.5"
        >
          <div className="h-9 w-9 shrink-0 rounded-lg bg-app-elevated" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-1/3 rounded bg-app-elevated" />
            <div className="h-3 w-1/4 rounded bg-app-elevated/60" />
          </div>
          <div className="h-3.5 w-16 shrink-0 rounded bg-app-elevated" />
        </div>
      ))}
    </div>
  );
}
