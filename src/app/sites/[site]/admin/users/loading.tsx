export default function UsersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 bg-neutral-100 rounded" />
        <div className="h-10 w-36 bg-neutral-100 rounded-lg" />
      </div>

      {/* Table */}
      <div className="border border-neutral-100 rounded-xl overflow-hidden">
        <div className="h-10 bg-neutral-50" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 border-t border-neutral-100 flex items-center gap-4 px-4">
            <div className="h-9 w-9 bg-neutral-100 rounded-full shrink-0" />
            <div className="h-4 w-32 bg-neutral-100 rounded" />
            <div className="h-4 w-40 bg-neutral-100 rounded" />
            <div className="h-6 w-16 bg-neutral-100 rounded-full ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
