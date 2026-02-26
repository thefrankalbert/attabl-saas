export default function ReportsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-neutral-100 rounded" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 w-16 bg-neutral-100 rounded-lg" />
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 bg-neutral-100 rounded-xl" />
        ))}
      </div>

      {/* Chart + Top items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <div className="lg:col-span-2 h-80 bg-neutral-100 rounded-xl" />
        <div className="h-80 bg-neutral-100 rounded-xl" />
      </div>
    </div>
  );
}
