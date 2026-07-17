import { cn } from '@/lib/utils';

interface KitchenSkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Layout skeleton for the KDS board (header + ticket grid + footer). Shared by
 * the route-level loading.tsx (navigation fallback) and KitchenClient's own
 * data-loading branch so both show the same YouTube-style placeholder instead
 * of a spinner.
 */
export function KitchenSkeleton({ className, style }: KitchenSkeletonProps) {
  return (
    <div
      className={cn('flex h-full flex-col overflow-hidden bg-app-bg animate-pulse', className)}
      style={style}
    >
      {/* Header h-12 : back icon + search | view tabs + zone filters + fullscreen */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-app-border bg-app-bg px-2 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 shrink-0 rounded-lg bg-app-elevated" />
          <div className="hidden h-5 w-24 rounded bg-app-elevated sm:block" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-8 w-20 rounded-lg bg-app-elevated" />
          <div className="h-8 w-24 rounded-lg bg-app-elevated" />
          <div className="h-8 w-8 rounded-lg bg-app-elevated" />
        </div>
      </header>

      {/* Board : grille de tickets KDS */}
      <div className="flex-1 overflow-hidden p-2 sm:p-3">
        <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[320px] flex-col gap-3 rounded-xl border border-app-border bg-app-card p-4"
            >
              {/* Ticket header : order number + time badge */}
              <div className="flex items-center justify-between">
                <div className="h-5 w-16 rounded bg-app-elevated" />
                <div className="h-5 w-12 rounded-full bg-app-elevated" />
              </div>
              {/* Table / customer label */}
              <div className="h-3.5 w-28 rounded bg-app-elevated" />
              {/* Items list */}
              <div className="mt-1 flex flex-1 flex-col gap-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <div className="h-3.5 w-5 shrink-0 rounded bg-app-elevated" />
                    <div className="h-3.5 flex-1 rounded bg-app-elevated" />
                  </div>
                ))}
              </div>
              {/* Action button */}
              <div className="mt-auto h-9 w-full rounded-lg bg-app-elevated" />
            </div>
          ))}
        </div>
      </div>

      {/* Footer h-14 : tenant name + status tabs */}
      <footer className="flex h-14 shrink-0 items-center gap-4 border-t border-app-border bg-app-card px-4">
        <div className="hidden h-4 w-28 rounded bg-app-elevated sm:block" />
        <div className="flex flex-1 items-center justify-center gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 w-16 rounded-lg bg-app-elevated" />
          ))}
        </div>
      </footer>
    </div>
  );
}
