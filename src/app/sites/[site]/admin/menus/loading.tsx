export default function MenusLoading() {
  return (
    <div className="h-full flex flex-col space-y-6 animate-pulse p-4 sm:p-6 lg:p-8">
      {/* Header Skeleton - matched to search + actions row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="h-6 w-10 bg-app-elevated rounded-full" />
        <div className="h-9 w-full sm:w-64 bg-app-elevated rounded-lg" />
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="h-9 w-28 bg-app-elevated rounded-md" />
          <div className="h-9 w-28 bg-app-elevated rounded-md" />
          <div className="h-9 w-28 bg-app-elevated rounded-md" />
        </div>
      </div>

      {/* Menu list/table skeleton */}
      <div className="flex-1 mt-4 sm:mt-6 border border-app-border rounded-xl overflow-hidden bg-app-card">
        {/* Table header row */}
        <div className="h-10 border-b border-app-border bg-app-bg/50" />

        {/* List items */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b border-app-border last:border-b-0"
          >
            <div className="h-4 w-4 bg-app-elevated rounded" />
            <div className="h-10 w-10 bg-app-elevated rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-app-elevated rounded" />
              <div className="h-3 w-1/4 bg-app-elevated/60 rounded" />
            </div>
            <div className="h-8 w-24 bg-app-elevated rounded-md ml-auto" />
            <div className="h-8 w-8 bg-app-elevated rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
