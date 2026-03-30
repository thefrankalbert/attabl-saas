export default function InventoryLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header + search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="h-7 w-32 bg-app-elevated rounded" />
        <div className="flex gap-2">
          <div className="h-10 w-48 bg-app-elevated rounded-lg" />
          <div className="h-10 w-10 bg-app-elevated rounded-lg" />
        </div>
      </div>

      {/* Inventory table */}
      <div className="border border-app-border rounded-xl overflow-hidden">
        <div className="h-10 bg-app-bg" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-14 border-t border-app-border flex items-center gap-4 px-4">
            <div className="h-4 w-36 bg-app-elevated rounded" />
            <div className="h-4 w-16 bg-app-elevated rounded" />
            <div className="h-6 w-20 bg-app-elevated rounded-full" />
            <div className="h-4 w-20 bg-app-elevated rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
