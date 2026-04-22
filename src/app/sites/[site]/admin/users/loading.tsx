export default function UsersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 bg-app-elevated rounded" />
        <div className="h-10 w-36 bg-app-elevated rounded-lg" />
      </div>

      {/* Table */}
      <div className="border border-app-border rounded-[10px] overflow-hidden">
        <div className="h-10 bg-app-bg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 border-t border-app-border flex items-center gap-4 px-4">
            <div className="h-9 w-9 bg-app-elevated rounded-full shrink-0" />
            <div className="h-4 w-32 bg-app-elevated rounded" />
            <div className="h-4 w-40 bg-app-elevated rounded" />
            <div className="h-6 w-16 bg-app-elevated rounded-full ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
