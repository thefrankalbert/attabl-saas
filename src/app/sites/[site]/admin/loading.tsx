export default function AdminLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6 py-6">
      {/* KPI section cards */}
      <div className="grid grid-cols-1 gap-4 px-3 sm:px-5 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-4 rounded-xl border border-app-border bg-app-card p-6">
            <div className="h-3 w-24 rounded bg-app-elevated" />
            <div className="h-8 w-32 rounded bg-app-elevated" />
            <div className="h-3 w-40 rounded bg-app-elevated/60" />
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="px-3 sm:px-5">
        <div className="space-y-4 rounded-xl border border-app-border bg-app-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="h-4 w-40 rounded bg-app-elevated" />
              <div className="h-3 w-56 rounded bg-app-elevated/60" />
            </div>
            <div className="flex gap-1">
              <div className="h-7 w-16 rounded-md bg-app-elevated" />
              <div className="h-7 w-14 rounded-md bg-app-elevated" />
              <div className="h-7 w-12 rounded-md bg-app-elevated" />
            </div>
          </div>
          <div className="h-[250px] w-full rounded-lg bg-app-elevated/30" />
        </div>
      </div>

      {/* Orders table */}
      <div className="px-3 sm:px-5">
        <div className="mb-3 h-9 w-80 rounded-[0.625rem] bg-app-elevated" />
        <div className="overflow-hidden rounded-xl border border-app-border bg-app-card">
          <div className="h-10 border-b border-app-border bg-app-bg/50" />
          <div className="divide-y divide-app-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-3 py-3">
                <div className="size-4 shrink-0 rounded bg-app-elevated" />
                <div className="h-3 w-28 rounded bg-app-elevated" />
                <div className="ml-auto h-3 w-16 rounded bg-app-elevated/60" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
