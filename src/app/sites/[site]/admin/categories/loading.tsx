export default function CategoriesLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      <div className="shrink-0 flex items-center gap-3">
        <div className="h-6 w-8 bg-app-elevated rounded-full" />
        <div className="h-9 w-32 bg-app-elevated rounded-lg ml-auto" />
      </div>

      <div className="flex-1 mt-4 sm:mt-6 border border-app-border rounded-xl overflow-hidden bg-app-card">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3 border-b border-app-border last:border-b-0"
          >
            <div className="h-4 w-4 bg-app-elevated rounded shrink-0" />
            <div className="flex-1 h-4 w-32 bg-app-elevated rounded" />
            <div className="flex items-center gap-1 shrink-0">
              <div className="h-3 w-3 bg-app-elevated rounded" />
              <div className="h-3 w-4 bg-app-elevated rounded" />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="h-9 w-9 bg-app-elevated rounded-lg" />
              <div className="h-9 w-9 bg-app-elevated rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
