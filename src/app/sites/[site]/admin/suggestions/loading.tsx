export default function SuggestionsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-app-elevated rounded" />
        <div className="h-10 w-40 bg-app-elevated rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-app-elevated rounded-[10px]" />
        ))}
      </div>
    </div>
  );
}
