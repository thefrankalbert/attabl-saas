export default function QRCodesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 bg-app-elevated rounded" />
        <div className="h-10 w-40 bg-app-elevated rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="border border-app-border rounded-[10px] p-6 flex flex-col items-center gap-4"
          >
            <div className="h-32 w-32 bg-app-elevated rounded-lg" />
            <div className="h-4 w-24 bg-app-elevated rounded" />
            <div className="h-8 w-28 bg-app-elevated rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
