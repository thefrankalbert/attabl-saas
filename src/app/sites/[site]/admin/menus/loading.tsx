export default function MenusLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 bg-app-elevated rounded" />
        <div className="h-10 w-36 bg-app-elevated rounded-lg" />
      </div>

      {/* Menu cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-app-border rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-app-elevated rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 bg-app-elevated rounded" />
                <div className="h-3 w-1/2 bg-app-elevated rounded" />
              </div>
            </div>
            <div className="h-8 w-full bg-app-elevated rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
