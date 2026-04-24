export default function ServiceLoading() {
  return (
    <div className="h-full flex flex-col overflow-hidden animate-pulse">
      {/* MetricsBar : 3 KPI columns */}
      <div className="flex items-stretch border-b border-app-border/50 bg-app-bg shrink-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex-1 border-r border-app-border/50 px-5 py-3.5 last:border-r-0">
            <div className="mb-2 h-3 w-24 bg-app-elevated rounded" />
            <div className="h-6 w-16 bg-app-elevated rounded" />
          </div>
        ))}
      </div>

      {/* Body : floor plan + right panel */}
      <div className="flex flex-1 min-h-0">
        {/* Floor plan */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Toolbar : zone tabs + search + view toggle */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-app-border/50 shrink-0">
            <div className="flex gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-7 w-20 bg-app-elevated rounded-lg" />
              ))}
            </div>
            <div className="flex-1 h-8 bg-app-elevated rounded-lg max-w-48" />
            <div className="flex gap-1 ml-auto">
              <div className="h-8 w-8 bg-app-elevated rounded-lg" />
              <div className="h-8 w-8 bg-app-elevated rounded-lg" />
            </div>
          </div>
          {/* Table grid */}
          <div className="flex-1 overflow-hidden p-4">
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-[88px] bg-app-elevated rounded-xl" />
              ))}
            </div>
          </div>
        </div>

        {/* Right panel : servers + ready orders (lg+) */}
        <div className="hidden lg:flex w-[280px] xl:w-[320px] shrink-0 border-l border-app-border/50 bg-app-card flex-col overflow-hidden">
          {/* Panel tabs */}
          <div className="flex border-b border-app-border/50 shrink-0">
            <div className="flex-1 h-10 bg-app-elevated/30" />
            <div className="flex-1 h-10 bg-app-elevated/20" />
          </div>
          {/* Server list */}
          <div className="flex-1 overflow-hidden p-3 flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="h-8 w-8 bg-app-elevated rounded-full shrink-0" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="h-3.5 w-24 bg-app-elevated rounded" />
                  <div className="h-3 w-16 bg-app-elevated rounded" />
                </div>
                <div className="h-5 w-5 bg-app-elevated rounded shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
