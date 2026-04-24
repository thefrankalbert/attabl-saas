export default function StockHistoryLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      {/* AnalyseTabs skeleton */}
      <div className="flex items-center gap-1 border-b border-app-border pb-2 mb-1 overflow-x-auto shrink-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-24 bg-app-elevated rounded-lg shrink-0" />
        ))}
      </div>

      <div className="shrink-0 space-y-4 mt-4">
        {/* Title + search row */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-6 w-36 bg-app-elevated rounded" />
            <div className="h-5 w-10 bg-app-elevated rounded-md" />
          </div>
          <div className="flex items-center gap-2 lg:ml-auto">
            <div className="h-9 w-full lg:w-52 bg-app-elevated rounded-lg" />
          </div>
        </div>

        {/* Filter pills: all + 5 types */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-7 w-24 bg-app-elevated rounded-lg shrink-0" />
          ))}
        </div>

        {/* Quick stats strip - 3 cards */}
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 px-3 py-2 bg-app-elevated border border-app-border/50 rounded-lg"
            >
              <div className="w-4 h-4 bg-app-card rounded shrink-0" />
              <div className="min-w-0">
                <div className="h-5 w-12 bg-app-card rounded mb-1" />
                <div className="h-2.5 w-16 bg-app-card rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table skeleton */}
      <div className="flex-1 min-h-0 mt-4 border border-app-border rounded-xl overflow-hidden bg-app-card">
        <div className="h-10 bg-app-bg/50 border-b border-app-border flex items-center gap-4 px-4">
          <div className="h-3 w-16 bg-app-elevated rounded" />
          <div className="h-3 w-28 bg-app-elevated rounded" />
          <div className="h-3 w-20 bg-app-elevated rounded" />
          <div className="h-3 w-14 bg-app-elevated rounded ml-auto" />
          <div className="h-3 w-20 bg-app-elevated rounded hidden sm:block" />
          <div className="h-3 w-24 bg-app-elevated rounded hidden md:block" />
        </div>
        <div className="divide-y divide-app-border">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <div className="flex flex-col gap-1 shrink-0">
                <div className="h-3.5 w-16 bg-app-elevated rounded" />
                <div className="h-2.5 w-10 bg-app-elevated rounded" />
              </div>
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-7 h-7 bg-app-elevated rounded-lg shrink-0" />
                <div className="min-w-0">
                  <div className="h-3.5 w-28 bg-app-elevated rounded mb-1" />
                  <div className="h-2.5 w-10 bg-app-elevated rounded" />
                </div>
              </div>
              <div className="h-5 w-24 bg-app-elevated rounded-md shrink-0" />
              <div className="flex items-center gap-1 ml-auto shrink-0">
                <div className="w-3.5 h-3.5 bg-app-elevated rounded" />
                <div className="h-4 w-12 bg-app-elevated rounded" />
              </div>
              <div className="h-3.5 w-20 bg-app-elevated rounded hidden sm:block shrink-0" />
              <div className="h-3.5 w-24 bg-app-elevated rounded hidden md:block shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
