export default function SettingsLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex gap-0 border-b border-app-border overflow-x-auto scrollbar-hide">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-11 w-20 sm:w-28 bg-app-elevated/50 rounded-none mx-1 first:ml-0"
          />
        ))}
      </div>

      {/* Tab content area */}
      <div className="flex-1 min-h-0 mt-4 sm:mt-6 space-y-6">
        {/* Section: identity-like - logo + 2-col fields */}
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Logo block */}
          <div className="flex flex-col items-center gap-3 sm:w-40 shrink-0">
            <div className="w-24 h-24 bg-app-elevated rounded-xl" />
            <div className="h-8 w-32 bg-app-elevated rounded-lg" />
          </div>

          {/* Fields grid */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3.5 w-24 bg-app-elevated rounded" />
                <div className="h-10 w-full bg-app-elevated rounded-lg" />
              </div>
            ))}
          </div>
        </div>

        {/* Section: second group (billing / sounds / security) */}
        <div className="bg-app-card border border-app-border rounded-xl p-4 sm:p-6 space-y-4">
          <div className="h-4 w-32 bg-app-elevated rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3.5 w-20 bg-app-elevated rounded" />
                <div className="h-10 w-full bg-app-elevated rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
