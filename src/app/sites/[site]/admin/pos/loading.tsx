export default function POSLoading() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] gap-4 animate-pulse">
      {/* Product grid */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Category tabs */}
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-24 bg-app-elevated rounded-lg shrink-0" />
          ))}
        </div>
        {/* Products */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 flex-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bg-app-elevated rounded-xl h-28" />
          ))}
        </div>
      </div>

      {/* Cart sidebar */}
      <div className="hidden md:flex w-80 lg:w-96 bg-app-elevated rounded-xl shrink-0" />
    </div>
  );
}
