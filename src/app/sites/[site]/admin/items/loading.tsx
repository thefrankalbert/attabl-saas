export default function ItemsLoading() {
  return (
    <div className="h-full flex flex-col space-y-6 animate-pulse p-4 sm:p-6 lg:p-8">
      <div className="shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="h-8 w-32 bg-app-elevated rounded-lg" />
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="h-9 w-44 bg-app-elevated rounded-lg" />
            <div className="h-9 w-36 bg-app-elevated rounded-lg" />
          </div>
          <div className="h-9 w-32 bg-app-elevated rounded-lg sm:ml-auto" />
        </div>
      </div>

      <div className="flex-1 border border-app-border rounded-xl overflow-hidden bg-app-card">
        <div className="h-10 border-b border-app-border bg-app-bg/50 flex items-center px-4 gap-3">
          <div className="h-4 w-4 bg-app-elevated rounded" />
          <div className="h-3 w-20 bg-app-elevated rounded" />
        </div>

        <div className="divide-y divide-app-border">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 sm:gap-4 px-4 py-3">
              <div className="h-4 w-4 bg-app-elevated rounded shrink-0" />
              <div className="h-12 w-12 bg-app-elevated rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 bg-app-elevated rounded" />
                <div className="h-3 w-1/4 bg-app-elevated rounded" />
              </div>
              <div className="h-5 w-16 bg-app-elevated rounded shrink-0 hidden sm:block" />
              <div className="h-7 w-20 bg-app-elevated rounded-full shrink-0" />
              <div className="h-5 w-5 bg-app-elevated rounded shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
