export default function OrdersLoading() {
  return (
    <div className="h-full flex flex-col space-y-6 animate-pulse p-4 sm:p-6 lg:p-8">
      {/* Header + Search Skeleton */}
      <div className="flex flex-col @lg:flex-row @lg:items-center gap-3">
        <div className="h-10 w-full @lg:w-64 bg-app-elevated rounded-lg" />

        {/* Tabs skeleton */}
        <div className="flex gap-1 bg-app-elevated/20 p-1 rounded-lg overflow-x-auto">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-app-elevated rounded-md shrink-0" />
          ))}
        </div>

        <div className="h-10 w-10 bg-app-elevated rounded-lg sm:ml-auto" />
      </div>

      {/* Table skeleton */}
      <div className="flex-1 mt-6 border border-app-border rounded-xl overflow-hidden bg-app-card">
        {/* Table header */}
        <div className="h-11 bg-app-bg/50 border-b border-app-border" />

        {/* Table body */}
        <div className="divide-y divide-app-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <div className="h-4 w-4 bg-app-elevated rounded shrink-0" />
              <div className="flex-1 flex items-center gap-3">
                <div className="h-8 w-10 bg-app-elevated rounded-lg shrink-0" />
                <div className="h-4 w-32 bg-app-elevated rounded" />
              </div>
              <div className="h-4 w-20 bg-app-elevated rounded hidden sm:block" />
              <div className="flex items-center gap-2 ml-auto">
                <div className="h-8 w-8 bg-app-elevated rounded shrink-0" />
                <div className="h-8 w-24 bg-app-elevated rounded shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
