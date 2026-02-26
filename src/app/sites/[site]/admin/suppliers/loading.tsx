export default function SuppliersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-neutral-100 rounded" />
        <div className="h-10 w-40 bg-neutral-100 rounded-lg" />
      </div>
      <div className="border border-neutral-100 rounded-xl overflow-hidden">
        <div className="h-10 bg-neutral-50" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 border-t border-neutral-100 flex items-center gap-4 px-4">
            <div className="h-4 w-36 bg-neutral-100 rounded" />
            <div className="h-4 w-28 bg-neutral-100 rounded" />
            <div className="h-4 w-24 bg-neutral-100 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
