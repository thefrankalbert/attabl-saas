export function OrdersSkeleton() {
  return (
    <div
      className="space-y-3"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
      aria-busy="true"
      aria-live="polite"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl p-4 bg-white border border-app-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 rounded-md animate-pulse bg-app-elevated" />
              <div className="h-5 w-16 rounded-md animate-pulse bg-app-elevated" />
            </div>
            <div className="h-5 w-14 rounded-md animate-pulse bg-app-elevated" />
          </div>
          <div className="h-3 w-32 rounded-md animate-pulse mb-4 bg-app-elevated" />
          <div className="flex items-center justify-between">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="flex flex-col items-center flex-1">
                <div className="w-7 h-7 rounded-full animate-pulse bg-app-elevated" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
