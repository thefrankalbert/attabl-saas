export default function AdminLoading() {
  return (
    <div className="space-y-8 animate-pulse p-4 sm:p-6 lg:p-8">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 flex-wrap">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-app-elevated rounded-lg" />
          <div className="h-4 w-48 bg-app-elevated/60 rounded mt-2" />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="h-9 w-28 bg-app-elevated rounded-md" />
          <div className="h-9 w-28 bg-app-elevated rounded-md" />
          <div className="h-9 w-28 bg-app-elevated rounded-md" />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-app-border rounded-[10px] bg-app-card overflow-hidden">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex flex-col p-5 space-y-3 border-r border-app-border last:border-r-0"
          >
            <div className="flex items-center gap-2">
              <div className="w-[5px] h-[5px] rounded-full bg-app-elevated" />
              <div className="h-3 w-16 bg-app-elevated rounded" />
            </div>
            <div className="h-7 w-24 bg-app-elevated rounded" />
            <div className="h-4 w-12 bg-app-elevated/60 rounded" />
          </div>
        ))}
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-1 gap-5 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
        {/* Large Card (Chart/Orders) */}
        <div className="flex flex-col gap-5 min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <div className="bg-app-card border border-app-border rounded-xl h-[400px] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-6 w-32 bg-app-elevated rounded" />
              <div className="h-8 w-24 bg-app-elevated rounded" />
            </div>
            <div className="w-full h-full bg-app-elevated/30 rounded-lg" />
          </div>
          <div className="bg-app-card border border-app-border rounded-xl h-[300px] p-6 space-y-4">
            <div className="h-6 w-48 bg-app-elevated rounded" />
            <div className="w-full h-full bg-app-elevated/20 rounded-lg" />
          </div>
        </div>

        {/* Side Cards (Recent/Stats) */}
        <div className="flex flex-col gap-5 lg:min-h-0 lg:overflow-hidden">
          <div className="bg-app-card border border-app-border rounded-xl p-5 space-y-4">
            <div className="h-5 w-28 bg-app-elevated rounded" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-app-elevated rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/4 bg-app-elevated rounded" />
                    <div className="h-2 w-1/2 bg-app-elevated/60 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-app-card border border-app-border rounded-xl p-5 space-y-4 min-h-[300px]">
            <div className="h-5 w-28 bg-app-elevated rounded" />
            <div className="w-full h-full bg-app-elevated/10 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
