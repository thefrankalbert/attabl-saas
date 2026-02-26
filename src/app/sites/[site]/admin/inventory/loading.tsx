export default function InventoryLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header + search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="h-7 w-32 bg-neutral-100 rounded" />
        <div className="flex gap-2">
          <div className="h-10 w-48 bg-neutral-100 rounded-lg" />
          <div className="h-10 w-10 bg-neutral-100 rounded-lg" />
        </div>
      </div>

      {/* Inventory table */}
      <div className="border border-neutral-100 rounded-xl overflow-hidden">
        <div className="h-10 bg-neutral-50" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-14 border-t border-neutral-100 flex items-center gap-4 px-4">
            <div className="h-4 w-36 bg-neutral-100 rounded" />
            <div className="h-4 w-16 bg-neutral-100 rounded" />
            <div className="h-6 w-20 bg-neutral-100 rounded-full" />
            <div className="h-4 w-20 bg-neutral-100 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
