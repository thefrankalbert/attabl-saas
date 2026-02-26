export default function AdsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-neutral-100 rounded" />
        <div className="h-10 w-36 bg-neutral-100 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 bg-neutral-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
