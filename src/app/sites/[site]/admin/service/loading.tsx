export default function ServiceLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-36 bg-neutral-100 rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 bg-neutral-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
