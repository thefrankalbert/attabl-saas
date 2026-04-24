export default function TablesLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-40 bg-app-elevated rounded" />
        <div className="h-4 w-64 bg-app-elevated rounded" />
      </div>

      {/* Main layout: left zone panel + right tables grid */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left panel: zone list */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-app-card border border-app-border rounded-xl p-4 space-y-3">
            {/* Panel header */}
            <div className="flex items-center justify-between mb-1">
              <div className="h-4 w-16 bg-app-elevated rounded" />
              <div className="h-3.5 w-10 bg-app-elevated rounded" />
            </div>
            {/* Zone items */}
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 w-full bg-app-elevated rounded-lg" />
              ))}
            </div>
            {/* Add zone button */}
            <div className="h-8 w-full bg-app-elevated rounded-lg mt-1" />
          </div>
        </div>

        {/* Right panel: tables grid */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Zone header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 bg-app-elevated rounded" />
              <div className="h-6 w-28 bg-app-elevated rounded" />
              <div className="h-5 w-10 bg-app-elevated rounded-full" />
            </div>
            <div className="h-9 w-28 bg-app-elevated rounded-lg" />
          </div>

          {/* Tables grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-32 bg-app-card border border-app-border rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-app-elevated" />
                    <div className="h-3 w-12 bg-app-elevated rounded" />
                  </div>
                </div>
                <div className="h-4 w-16 bg-app-elevated rounded" />
                <div className="flex items-center gap-2">
                  <div className="h-3 w-14 bg-app-elevated rounded" />
                  <div className="h-7 w-14 bg-app-elevated rounded" />
                </div>
                <div className="h-4 w-20 bg-app-elevated rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
