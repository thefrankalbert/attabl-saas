export default function SuppliersLoading() {
  return (
    <div className="h-full flex flex-col space-y-6 animate-pulse p-4 sm:p-6 lg:p-8">
      <div className="shrink-0 space-y-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-app-elevated rounded shrink-0" />
            <div className="h-7 w-36 bg-app-elevated rounded" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="h-10 w-full sm:w-56 bg-app-elevated rounded-lg" />
            <div className="flex gap-2 shrink-0">
              <div className="h-9 w-16 bg-app-elevated rounded-full" />
              <div className="h-9 w-20 bg-app-elevated rounded-full" />
              <div className="h-9 w-24 bg-app-elevated rounded-full" />
            </div>
            <div className="h-9 w-36 bg-app-elevated rounded-lg sm:ml-auto" />
          </div>
        </div>
      </div>

      <div className="flex-1 border border-app-border rounded-xl overflow-hidden bg-app-card">
        <div className="h-11 bg-app-bg/50 border-b border-app-border" />
        <div className="divide-y divide-app-border">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-36 bg-app-elevated rounded" />
                <div className="h-3 w-24 bg-app-elevated rounded" />
              </div>
              <div className="h-4 w-40 bg-app-elevated rounded hidden md:block" />
              <div className="h-4 w-28 bg-app-elevated rounded hidden md:block" />
              <div className="h-4 w-32 bg-app-elevated rounded hidden lg:block" />
              <div className="h-5 w-16 bg-app-elevated rounded-full shrink-0" />
              <div className="flex gap-1 shrink-0">
                <div className="h-8 w-16 bg-app-elevated rounded" />
                <div className="h-8 w-8 bg-app-elevated rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
