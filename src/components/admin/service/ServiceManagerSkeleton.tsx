// Loading placeholder for the Service dashboard: metrics-bar stub, table
// grid stub and right-panel stub. Extracted verbatim from ServiceManager's
// loading branch; markup and classes unchanged.
export function ServiceManagerSkeleton() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-stretch border-b border-app-border/50 bg-app-bg">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 border-r border-app-border/50 px-5 py-3.5 last:border-r-0">
            <div className="mb-2 h-3 w-24 animate-pulse rounded bg-app-elevated" />
            <div className="h-6 w-16 animate-pulse rounded bg-app-elevated" />
          </div>
        ))}
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 p-4">
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[88px] animate-pulse rounded bg-app-elevated" />
            ))}
          </div>
        </div>
        <div className="hidden w-[280px] shrink-0 border-l border-app-border/50 bg-app-card lg:block xl:w-[320px]" />
      </div>
    </div>
  );
}
