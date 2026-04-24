export default function POSLoading() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-app-bg animate-pulse">
      {/* Top bar : back button + title (desktop) / tab switcher (mobile) */}
      <div className="flex items-center border-b border-app-border shrink-0 h-11">
        <div className="h-9 w-9 bg-app-elevated rounded-lg mx-2 shrink-0" />
        <div className="h-4 w-20 bg-app-elevated rounded hidden md:block" />
        {/* Mobile tab switcher placeholder */}
        <div className="flex flex-1 md:hidden">
          <div className="flex-1 h-11 bg-app-elevated/30" />
          <div className="flex-1 h-11 bg-app-elevated/20" />
        </div>
      </div>

      {/* Main layout : products | cart */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Products section */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Search bar + category tabs */}
          <div className="flex flex-col gap-2 p-3 border-b border-app-border shrink-0">
            <div className="h-9 w-full bg-app-elevated rounded-lg" />
            <div className="flex gap-2 overflow-x-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 w-20 bg-app-elevated rounded-lg shrink-0" />
              ))}
            </div>
          </div>
          {/* Product grid */}
          <div className="flex-1 overflow-hidden p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 h-full content-start">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="bg-app-elevated rounded-xl h-28" />
              ))}
            </div>
          </div>
        </div>

        {/* Cart section : hidden on mobile, visible md+ */}
        <div className="hidden md:flex w-full md:w-[45%] lg:w-[42%] xl:w-[40%] border-l border-app-border flex-col overflow-hidden shrink-0">
          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-app-border shrink-0">
            <div className="h-4 w-24 bg-app-elevated rounded" />
            <div className="h-6 w-12 bg-app-elevated rounded-full" />
          </div>
          {/* Cart items */}
          <div className="flex-1 overflow-hidden px-4 py-3 flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 bg-app-elevated rounded-lg shrink-0" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="h-3.5 w-32 bg-app-elevated rounded" />
                  <div className="h-3 w-16 bg-app-elevated rounded" />
                </div>
                <div className="h-4 w-14 bg-app-elevated rounded" />
              </div>
            ))}
          </div>
          {/* Cart footer : service type + totals + actions */}
          <div className="shrink-0 border-t border-app-border px-4 py-4 flex flex-col gap-3">
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 flex-1 bg-app-elevated rounded-lg" />
              ))}
            </div>
            <div className="flex justify-between">
              <div className="h-4 w-16 bg-app-elevated rounded" />
              <div className="h-4 w-20 bg-app-elevated rounded" />
            </div>
            <div className="h-10 w-full bg-app-elevated rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
