export default function OrdersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header + filters */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 bg-app-elevated rounded" />
        <div className="h-10 w-32 bg-app-elevated rounded-lg" />
      </div>

      {/* Status tabs */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-24 bg-app-elevated rounded-lg" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="border border-app-border rounded-xl overflow-hidden">
        <div className="h-10 bg-app-bg" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 border-t border-app-border flex items-center gap-4 px-4">
            <div className="h-4 w-20 bg-app-elevated rounded" />
            <div className="h-4 w-32 bg-app-elevated rounded" />
            <div className="h-4 w-16 bg-app-elevated rounded" />
            <div className="h-4 w-24 bg-app-elevated rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
