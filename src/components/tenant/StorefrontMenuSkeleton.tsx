/**
 * Light-theme skeleton for the customer menu page (header + category tabs +
 * dish rows with thumbnail). Rendered as the route loading fallback so scanning
 * a QR shows the menu structure instantly instead of a spinner.
 */
export function StorefrontMenuSkeleton() {
  return (
    <div className="flex h-full flex-col bg-white animate-pulse">
      {/* Header: back + title + search */}
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gray-200" />
          <div className="h-5 w-40 rounded bg-gray-200" />
        </div>
        <div className="h-6 w-6 rounded bg-gray-200" />
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-hidden px-4 pb-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-24 shrink-0 rounded-full bg-gray-200" />
        ))}
      </div>

      {/* Section title */}
      <div className="px-4 pt-2 pb-1">
        <div className="h-6 w-36 rounded bg-gray-200" />
      </div>

      {/* Dish rows */}
      <div className="flex-1 divide-y divide-gray-100">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start justify-between gap-4 px-4 py-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-gray-200" />
              <div className="h-3 w-5/6 rounded bg-gray-100" />
              <div className="mt-2 h-4 w-20 rounded bg-gray-200" />
            </div>
            <div className="h-20 w-20 shrink-0 rounded-xl bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
