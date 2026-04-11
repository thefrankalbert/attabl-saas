export default function AdminDashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Title */}
      <div>
        <div className="h-7 w-48 bg-app-elevated rounded" />
        <div className="h-4 w-32 bg-app-elevated rounded mt-2" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-app-elevated rounded-xl" />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-72 bg-app-elevated rounded-xl" />
        <div className="h-72 bg-app-elevated rounded-xl" />
      </div>

      {/* Recent orders table */}
      <div className="h-64 bg-app-elevated rounded-xl" />
    </div>
  );
}
