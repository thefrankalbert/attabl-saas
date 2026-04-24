export default function RecipesLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      <div className="shrink-0 space-y-3 mb-4 sm:mb-6">
        <div className="flex flex-col gap-3">
          <div className="h-7 w-64 bg-app-elevated rounded" />
          <div className="flex gap-3">
            <div className="h-10 w-full max-w-64 bg-app-elevated rounded-lg" />
            <div className="flex gap-2">
              <div className="h-8 w-16 bg-app-elevated rounded-full" />
              <div className="h-8 w-24 bg-app-elevated rounded-full" />
              <div className="h-8 w-28 bg-app-elevated rounded-full" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-6">
        <div className="flex flex-col gap-6">
          <div className="flex-1 bg-app-card rounded-xl border border-app-border overflow-hidden">
            <div className="divide-y divide-app-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="h-4 w-40 bg-app-elevated rounded" />
                  <div className="h-5 w-20 bg-app-elevated rounded-full" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-app-card rounded-xl border border-app-border overflow-hidden">
            <div className="px-4 py-3 border-b border-app-border bg-app-bg/50">
              <div className="h-4 w-48 bg-app-elevated rounded" />
            </div>
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 bg-app-elevated rounded-lg" />
              ))}
              <div className="h-9 w-full bg-app-elevated rounded-lg mt-2" />
            </div>
            <div className="px-4 py-3 border-t border-app-border bg-app-bg/50">
              <div className="h-9 w-full bg-app-elevated rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
