export default function AdsLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      <div className="shrink-0 flex items-center">
        <div className="inline-flex items-center gap-2 border border-app-border rounded-lg px-1.5 py-1">
          <div className="h-4 w-6 bg-app-elevated rounded" />
          <div className="h-7 w-24 bg-app-elevated rounded-md" />
        </div>
      </div>

      <div className="flex-1 mt-2 sm:mt-4 bg-app-card rounded-xl border border-app-border overflow-hidden">
        <div className="divide-y divide-app-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="w-16 h-10 bg-app-elevated rounded-lg shrink-0" />
              <div className="flex-1 h-4 bg-app-elevated rounded" />
              <div className="h-4 w-6 bg-app-elevated rounded shrink-0" />
              <div className="h-5 w-16 bg-app-elevated rounded shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                <div className="h-8 w-8 bg-app-elevated rounded" />
                <div className="h-8 w-8 bg-app-elevated rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
