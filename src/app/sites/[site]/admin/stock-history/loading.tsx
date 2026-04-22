export default function StockHistoryLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-44 bg-app-elevated rounded" />
      <div className="border border-app-border rounded-[10px] overflow-hidden">
        <div className="h-10 bg-app-bg" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 border-t border-app-border flex items-center gap-4 px-4">
            <div className="h-4 w-24 bg-app-elevated rounded" />
            <div className="h-4 w-32 bg-app-elevated rounded" />
            <div className="h-4 w-16 bg-app-elevated rounded" />
            <div className="h-4 w-20 bg-app-elevated rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
