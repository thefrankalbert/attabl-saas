export default function MenuDetailLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      {/* Breadcrumb + active toggle */}
      <div className="shrink-0 flex items-center justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <div className="h-4 w-20 bg-app-elevated rounded" />
          <div className="h-4 w-4 bg-app-elevated/40 rounded" />
          <div className="h-4 w-32 bg-app-elevated rounded" />
        </div>
        <div className="h-7 w-20 bg-app-elevated rounded-full shrink-0" />
      </div>

      {/* Categories section header */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-36 bg-app-elevated rounded" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-36 bg-app-elevated rounded-md" />
            <div className="h-8 w-32 bg-app-elevated rounded-md" />
          </div>
        </div>

        {/* Category cards */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, ci) => (
            <div key={ci} className="space-y-2">
              {/* Category header row */}
              <div className="flex items-center gap-4 p-4 bg-app-card border border-app-border rounded-xl">
                <div className="w-9 h-9 bg-app-elevated rounded-lg shrink-0" />
                <div className="flex-1 h-4 w-40 bg-app-elevated rounded" />
                <div className="h-3 w-16 bg-app-elevated/60 rounded hidden sm:block" />
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-8 w-8 bg-app-elevated rounded-md" />
                  <div className="h-8 w-8 bg-app-elevated rounded-md" />
                  <div className="h-8 w-8 bg-app-elevated rounded-md" />
                </div>
              </div>

              {/* Items under category */}
              {ci === 0 && (
                <div className="ml-6 space-y-1">
                  {Array.from({ length: 3 }).map((_, ii) => (
                    <div key={ii} className="flex items-center gap-3 p-3 bg-app-bg rounded-lg">
                      <div className="w-8 h-8 bg-app-elevated rounded shrink-0" />
                      <div className="flex-1 h-3.5 bg-app-elevated rounded" />
                      <div className="h-4 w-16 bg-app-elevated rounded" />
                      <div className="h-7 w-7 bg-app-elevated rounded" />
                      <div className="h-7 w-7 bg-app-elevated rounded" />
                      <div className="h-7 w-7 bg-app-elevated rounded" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
