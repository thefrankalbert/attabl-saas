/**
 * Light-theme skeleton for the customer cart page (header + line items +
 * totals + checkout bar). Route loading fallback, in place of a spinner.
 */
export function StorefrontCartSkeleton() {
  return (
    <div className="flex h-full flex-col bg-white animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="h-9 w-9 rounded-full bg-gray-200" />
        <div className="h-5 w-28 rounded bg-gray-200" />
      </div>

      {/* Line items */}
      <div className="flex-1 space-y-3 px-4 pt-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
            <div className="h-16 w-16 shrink-0 rounded-lg bg-gray-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-gray-200" />
              <div className="h-3 w-1/3 rounded bg-gray-100" />
            </div>
            <div className="h-8 w-24 shrink-0 rounded-full bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Totals + checkout */}
      <div className="space-y-3 border-t border-gray-100 px-4 py-4">
        <div className="flex justify-between">
          <div className="h-4 w-20 rounded bg-gray-100" />
          <div className="h-4 w-24 rounded bg-gray-200" />
        </div>
        <div className="flex justify-between">
          <div className="h-4 w-16 rounded bg-gray-100" />
          <div className="h-4 w-20 rounded bg-gray-200" />
        </div>
        <div className="h-12 w-full rounded-full bg-gray-200" />
      </div>
    </div>
  );
}
