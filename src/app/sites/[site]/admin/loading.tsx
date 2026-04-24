export default function AdminLoading() {
  return (
    <div className="h-full flex flex-col gap-5 animate-pulse p-4 sm:p-6 pb-12 lg:pb-6">
      {/* Header: greeting + 3 quick-action links */}
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="space-y-2">
          <div className="h-7 w-72 bg-app-elevated rounded-lg" />
          <div className="h-3.5 w-48 bg-app-elevated/60 rounded" />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="h-8 w-28 bg-app-elevated rounded-md" />
          <div className="h-8 w-24 bg-app-elevated rounded-md" />
          <div className="h-8 w-32 bg-app-elevated rounded-md" />
        </div>
      </div>

      {/* Metrics row: 4 KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-app-card border border-app-border rounded-xl p-4 space-y-3">
            <div className="h-3 w-20 bg-app-elevated rounded" />
            <div className="h-7 w-28 bg-app-elevated rounded" />
            <div className="h-3 w-16 bg-app-elevated/60 rounded" />
          </div>
        ))}
      </div>

      {/* Main grid: left col (chart + top dishes) + right col (stock + orders feed) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-1 gap-5 flex-1 lg:min-h-0 lg:overflow-hidden">
        {/* Left column */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* OverviewChart placeholder */}
          <div className="bg-app-card border border-app-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="h-5 w-40 bg-app-elevated rounded" />
              <div className="flex gap-1">
                <div className="h-7 w-16 bg-app-elevated rounded-md" />
                <div className="h-7 w-20 bg-app-elevated rounded-md" />
                <div className="h-7 w-20 bg-app-elevated rounded-md" />
              </div>
            </div>
            <div className="h-[260px] w-full bg-app-elevated/30 rounded-lg" />
          </div>

          {/* TopDishesCard placeholder */}
          <div className="bg-app-card border border-app-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="h-5 w-36 bg-app-elevated rounded" />
              <div className="h-5 w-14 bg-app-elevated rounded-full" />
            </div>
            <div className="h-8 w-full bg-app-elevated/40 rounded-lg" />
            <div className="h-9 bg-app-bg/50 border-b border-app-border rounded-t-lg" />
            <div className="divide-y divide-app-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <div className="w-8 h-8 bg-app-elevated rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 bg-app-elevated rounded" />
                    <div className="h-2.5 w-20 bg-app-elevated/60 rounded" />
                  </div>
                  <div className="h-3 w-12 bg-app-elevated rounded hidden sm:block" />
                  <div className="h-3 w-16 bg-app-elevated rounded hidden md:block" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5 lg:min-h-0 lg:overflow-hidden">
          {/* StockAlertsCard placeholder */}
          <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-3">
            <div className="h-4 w-28 bg-app-elevated rounded" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 bg-app-elevated rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-24 bg-app-elevated rounded" />
                  <div className="h-2.5 w-32 bg-app-elevated/60 rounded" />
                </div>
              </div>
            ))}
          </div>

          {/* LiveOrdersFeed placeholder */}
          <div className="flex-1 bg-app-card border border-app-border rounded-xl flex flex-col min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-app-border flex items-center justify-between shrink-0">
              <div className="h-4 w-28 bg-app-elevated rounded" />
              <div className="h-6 w-6 bg-app-elevated rounded-md" />
            </div>
            <div className="divide-y divide-app-border flex-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-3 w-24 bg-app-elevated rounded" />
                    <div className="h-2.5 w-16 bg-app-elevated/60 rounded" />
                  </div>
                  <div className="h-6 w-20 bg-app-elevated rounded-full shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
