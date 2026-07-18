export default function Loading() {
  return (
    <div className="flex-1 min-h-0 flex flex-col w-full p-4 sm:p-6">
      <div className="h-6 w-48 rounded bg-app-border/40 animate-pulse" />
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-lg bg-app-border/30 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
