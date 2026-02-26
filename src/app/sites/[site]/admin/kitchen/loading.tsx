export default function KitchenLoading() {
  return (
    <div
      className="fixed inset-0 z-[200] bg-neutral-950 flex flex-col overflow-hidden animate-pulse"
      style={{
        padding:
          'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-neutral-800 rounded" />
          <div className="h-5 w-32 bg-neutral-800 rounded" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-neutral-800 rounded-lg" />
          ))}
        </div>
      </div>

      {/* KDS ticket grid */}
      <div className="flex-1 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3"
          >
            <div className="flex justify-between">
              <div className="h-5 w-16 bg-neutral-800 rounded" />
              <div className="h-5 w-12 bg-neutral-800 rounded" />
            </div>
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-4 w-full bg-neutral-800 rounded" />
            ))}
            <div className="h-9 w-full bg-neutral-800 rounded-lg mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
