export default function StockHistoryLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-44 bg-neutral-100 rounded" />
      <div className="border border-neutral-100 rounded-xl overflow-hidden">
        <div className="h-10 bg-neutral-50" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 border-t border-neutral-100 flex items-center gap-4 px-4">
            <div className="h-4 w-24 bg-neutral-100 rounded" />
            <div className="h-4 w-32 bg-neutral-100 rounded" />
            <div className="h-4 w-16 bg-neutral-100 rounded" />
            <div className="h-4 w-20 bg-neutral-100 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
