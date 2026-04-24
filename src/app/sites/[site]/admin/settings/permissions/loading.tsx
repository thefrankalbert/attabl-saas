export default function PermissionsLoading() {
  const ROLES = 6;
  const CATEGORY_ROWS = [2, 2, 1, 1, 2, 2, 2];

  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-48 bg-app-elevated rounded" />
        <div className="h-4 w-72 bg-app-elevated rounded" />
      </div>

      {/* Permissions matrix table */}
      <div className="flex-1 border border-app-border rounded-xl overflow-hidden bg-app-card">
        {/* Header row */}
        <div className="h-12 bg-app-bg/50 border-b border-app-border flex items-center gap-3 px-5">
          <div className="h-4 w-36 bg-app-elevated rounded min-w-[180px]" />
          {Array.from({ length: ROLES }).map((_, i) => (
            <div key={i} className="h-6 w-16 bg-app-elevated rounded-full mx-auto" />
          ))}
        </div>

        {/* Body rows grouped by category */}
        <div className="divide-y divide-app-border">
          {CATEGORY_ROWS.map((count, ci) => (
            <div key={ci}>
              {/* Category label row */}
              <div className="h-9 bg-app-card border-b border-app-border flex items-center px-5">
                <div className="h-3 w-20 bg-app-elevated rounded" />
              </div>
              {/* Permission rows */}
              {Array.from({ length: count }).map((_, ri) => (
                <div
                  key={ri}
                  className="flex items-center gap-3 px-5 py-3 border-b border-app-border last:border-0"
                  style={{ background: ri % 2 === 0 ? undefined : 'var(--app-bg, transparent)' }}
                >
                  <div className="h-4 w-32 bg-app-elevated rounded min-w-[180px]" />
                  {Array.from({ length: ROLES }).map((_, ci2) => (
                    <div
                      key={ci2}
                      className="h-5 w-9 bg-app-elevated rounded-full mx-auto shrink-0"
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="border border-app-border rounded-xl p-4 sm:p-6 space-y-2 bg-app-card shrink-0">
        <div className="h-3.5 w-64 bg-app-elevated rounded" />
        <div className="h-3.5 w-48 bg-app-elevated rounded" />
        <div className="h-3.5 w-80 bg-app-elevated rounded" />
      </div>
    </div>
  );
}
