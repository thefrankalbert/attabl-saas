// --- Loading skeleton -----------------------------------------------------

export function OnboardingLoadingSkeleton() {
  return (
    /* Standalone page - h-dvh is intentional */
    <div className="h-dvh overflow-hidden flex flex-col bg-app-bg">
      {/* Top strip skeleton */}
      <header className="shrink-0 h-14 bg-app-card/80 border-b border-app-border/50 flex items-center px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-app-elevated animate-pulse" />
          <div className="h-4 w-24 rounded bg-app-elevated animate-pulse" />
        </div>
        <div className="flex-1 flex justify-center gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-8 rounded-full bg-app-elevated animate-pulse"
              style={{ width: `${80 + i * 10}px` }}
            />
          ))}
        </div>
        <div className="h-4 w-12 rounded bg-app-elevated animate-pulse" />
      </header>

      {/* Two-column skeleton */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 p-6 space-y-6 animate-pulse">
          <div className="h-7 w-64 rounded-lg bg-app-elevated/30" />
          <div className="h-4 w-96 rounded bg-app-elevated/20" />
          <div className="space-y-4">
            <div className="h-48 rounded-xl bg-app-elevated/20" />
            <div className="h-32 rounded-xl bg-app-elevated/20" />
          </div>
        </div>
        <div className="hidden lg:flex w-80 items-center justify-center p-6">
          <div className="w-56 h-110 rounded-[2.5rem] bg-app-elevated/20 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
