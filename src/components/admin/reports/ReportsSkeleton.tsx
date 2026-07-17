/**
 * Layout skeleton for the Reports view: export row + period tabs, 3 KPI cards,
 * the revenue chart, and the top-products panel. Shown in ReportsClient's
 * data-loading branch instead of a spinner so the structure is visible while
 * the RPCs resolve.
 */
export function ReportsSkeleton() {
  return (
    <div className="flex flex-1 min-h-0 animate-pulse flex-col gap-4 overflow-hidden">
      {/* Export row + period tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <div className="h-9 w-20 rounded-lg bg-app-elevated" />
          <div className="h-9 w-20 rounded-lg bg-app-elevated" />
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-24 shrink-0 rounded-lg bg-app-elevated" />
          ))}
        </div>
      </div>

      {/* 3 KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-app-border bg-app-card p-6">
            <div className="h-3 w-28 rounded bg-app-elevated" />
            <div className="h-7 w-32 rounded bg-app-elevated" />
          </div>
        ))}
      </div>

      {/* Revenue chart + top products */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-app-border bg-app-card p-6 lg:col-span-2">
          <div className="h-4 w-44 rounded bg-app-elevated" />
          <div className="h-[220px] w-full rounded-lg bg-app-elevated/30" />
        </div>
        <div className="space-y-4 rounded-xl border border-app-border bg-app-card p-6">
          <div className="h-4 w-28 rounded bg-app-elevated" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-app-elevated" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 rounded bg-app-elevated" />
                <div className="h-3 w-1/3 rounded bg-app-elevated/60" />
              </div>
              <div className="h-3.5 w-16 shrink-0 rounded bg-app-elevated" />
            </div>
          ))}
        </div>
      </div>

      {/* Product ranking table */}
      <div className="overflow-hidden rounded-xl border border-app-border bg-app-card">
        <div className="h-11 border-b border-app-border bg-app-bg/50" />
        <div className="divide-y divide-app-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <div className="h-3.5 w-40 rounded bg-app-elevated" />
              <div className="ml-auto h-3.5 w-16 rounded bg-app-elevated/60" />
              <div className="h-3.5 w-20 rounded bg-app-elevated/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
