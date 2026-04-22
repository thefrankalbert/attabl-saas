export default function SuppliersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-app-elevated rounded" />
        <div className="h-10 w-40 bg-app-elevated rounded-lg" />
      </div>
      <div className="border border-app-border rounded-[10px] overflow-hidden">
        <div className="h-10 bg-app-bg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 border-t border-app-border flex items-center gap-4 px-4">
            <div className="h-4 w-36 bg-app-elevated rounded" />
            <div className="h-4 w-28 bg-app-elevated rounded" />
            <div className="h-4 w-24 bg-app-elevated rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
