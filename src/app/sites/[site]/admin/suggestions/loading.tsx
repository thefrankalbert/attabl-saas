export default function SuggestionsLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      {/* Header row: count + search + bulk actions + add button */}
      <div className="shrink-0 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="h-4 w-10 bg-app-elevated rounded" />

        {/* Search input */}
        <div className="h-10 w-full lg:w-56 xl:w-64 bg-app-elevated rounded-lg shrink-0" />

        {/* Bulk action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-8 w-28 bg-app-elevated rounded-lg" />
        </div>

        {/* Action buttons: auto-generate + add */}
        <div className="flex items-center gap-2 lg:ml-auto shrink-0">
          <div className="h-9 w-32 bg-app-elevated rounded-lg" />
          <div className="h-9 w-36 bg-app-elevated rounded-lg" />
        </div>
      </div>

      {/* Suggestions list */}
      <div className="flex-1 min-h-0 mt-2 sm:mt-4 border border-app-border rounded-xl overflow-hidden bg-app-card">
        <div className="divide-y divide-app-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              {/* Checkbox */}
              <div className="w-4 h-4 bg-app-elevated rounded shrink-0" />
              {/* Type badge */}
              <div className="h-5 w-20 bg-app-elevated rounded-full shrink-0" />
              {/* Source -> target */}
              <div className="flex-1 min-w-0">
                <div className="h-4 w-full max-w-xs bg-app-elevated rounded" />
              </div>
              {/* Delete button */}
              <div className="w-8 h-8 bg-app-elevated rounded shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
