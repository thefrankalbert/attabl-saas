export default function ReportsLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      {/* AnalyseTabs skeleton */}
      <div className="flex items-center gap-1 border-b border-app-border pb-2 mb-1 overflow-x-auto shrink-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-24 bg-app-elevated rounded-lg shrink-0" />
        ))}
      </div>

      <div className="shrink-0 space-y-4 mt-4">
        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-16 bg-app-elevated rounded-lg" />
          <div className="h-8 w-16 bg-app-elevated rounded-lg" />
        </div>

        {/* Period pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-20 bg-app-elevated rounded-lg shrink-0" />
          ))}
        </div>

        {/* KPI cards - 3 columns */}
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="px-3 py-2.5 bg-app-elevated border border-app-border/50 rounded-lg"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 bg-app-card rounded" />
                <div className="h-2.5 w-16 bg-app-card rounded" />
              </div>
              <div className="h-6 w-24 bg-app-card rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 mt-4 space-y-4">
        {/* Chart + Top items */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 bg-app-card border border-app-border/60 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="h-4 w-32 bg-app-elevated rounded" />
              <div className="h-5 w-16 bg-app-elevated rounded-md" />
            </div>
            <div className="h-52 bg-app-elevated/50 rounded-lg" />
          </div>

          <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
            <div className="h-4 w-28 bg-app-elevated rounded mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-6 h-6 bg-app-elevated rounded-md shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="h-3.5 w-full bg-app-elevated rounded mb-1" />
                    <div className="h-2.5 w-16 bg-app-elevated rounded" />
                  </div>
                  <div className="h-3.5 w-16 bg-app-elevated rounded shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Product ranking table */}
        <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
          <div className="h-4 w-40 bg-app-elevated rounded mb-3" />
          <div className="h-8 bg-app-bg/50 border-b border-app-border rounded-t-md" />
          <div className="divide-y divide-app-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 px-2">
                <div className="h-3.5 w-4 bg-app-elevated rounded" />
                <div className="h-3.5 flex-1 bg-app-elevated rounded" />
                <div className="h-3.5 w-12 bg-app-elevated rounded" />
                <div className="h-3.5 w-20 bg-app-elevated rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Category breakdown + Server performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
            <div className="h-4 w-36 bg-app-elevated rounded mb-4" />
            <div className="h-48 bg-app-elevated/50 rounded-lg" />
          </div>
          <div className="bg-app-card border border-app-border/60 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-4 h-4 bg-app-elevated rounded" />
              <div className="h-4 w-36 bg-app-elevated rounded" />
            </div>
            <div className="h-24 bg-app-elevated/50 rounded-lg mb-4" />
            <div className="divide-y divide-app-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2 px-2">
                  <div className="h-3.5 flex-1 bg-app-elevated rounded" />
                  <div className="h-3.5 w-10 bg-app-elevated rounded" />
                  <div className="h-3.5 w-16 bg-app-elevated rounded" />
                  <div className="h-3.5 w-14 bg-app-elevated rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
