export default function InventoryLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      {/* Header row: title + search + filter pills + add button */}
      <div className="shrink-0 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* Title */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-5 h-5 bg-app-elevated rounded" />
            <div className="h-6 w-28 bg-app-elevated rounded" />
            <div className="h-4 w-8 bg-app-elevated rounded" />
          </div>

          {/* Search input */}
          <div className="h-9 w-full lg:w-56 xl:w-64 bg-app-elevated rounded-lg shrink-0" />

          {/* Filter pills: all / low / out */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 w-20 bg-app-elevated rounded-full shrink-0" />
            ))}
          </div>

          {/* Add button */}
          <div className="lg:ml-auto shrink-0">
            <div className="h-9 w-36 bg-app-elevated rounded-lg" />
          </div>
        </div>
      </div>

      {/* Table skeleton */}
      <div className="flex-1 min-h-0 mt-4 sm:mt-6 border border-app-border rounded-xl overflow-hidden bg-app-card">
        {/* Table header */}
        <div className="h-10 bg-app-bg/50 border-b border-app-border flex items-center gap-4 px-4">
          <div className="h-3 w-24 bg-app-elevated rounded" />
          <div className="h-3 w-12 bg-app-elevated rounded" />
          <div className="h-3 w-20 bg-app-elevated rounded ml-auto" />
          <div className="h-3 w-16 bg-app-elevated rounded" />
          <div className="h-3 w-20 bg-app-elevated rounded" />
          <div className="h-3 w-14 bg-app-elevated rounded" />
          <div className="h-3 w-16 bg-app-elevated rounded" />
        </div>
        <div className="divide-y divide-app-border">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="h-4 w-36 bg-app-elevated rounded mb-1" />
                <div className="h-3 w-20 bg-app-elevated rounded" />
              </div>
              <div className="h-3.5 w-10 bg-app-elevated rounded hidden sm:block" />
              <div className="h-4 w-16 bg-app-elevated rounded ml-auto" />
              <div className="h-3.5 w-12 bg-app-elevated rounded hidden md:block" />
              <div className="h-3.5 w-16 bg-app-elevated rounded hidden md:block" />
              <div className="h-6 w-20 bg-app-elevated rounded-full" />
              <div className="flex gap-1">
                <div className="h-7 w-10 bg-app-elevated rounded" />
                <div className="h-7 w-14 bg-app-elevated rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
