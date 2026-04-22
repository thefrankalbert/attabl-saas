export default function ItemsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header + search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="h-7 w-28 bg-app-elevated rounded" />
        <div className="flex gap-2">
          <div className="h-10 w-48 bg-app-elevated rounded-lg" />
          <div className="h-10 w-32 bg-app-elevated rounded-lg" />
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-app-elevated rounded-full shrink-0" />
        ))}
      </div>

      {/* Items grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="border border-app-border rounded-[10px] overflow-hidden">
            <div className="h-36 bg-app-elevated" />
            <div className="p-4 space-y-2">
              <div className="h-4 w-3/4 bg-app-elevated rounded" />
              <div className="h-3 w-1/2 bg-app-elevated rounded" />
              <div className="h-5 w-20 bg-app-elevated rounded mt-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
