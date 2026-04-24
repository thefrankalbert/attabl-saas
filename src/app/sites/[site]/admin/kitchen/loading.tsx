export default function KitchenLoading() {
  return (
    <div
      className="h-full flex flex-col overflow-hidden animate-pulse bg-app-bg"
      style={{
        padding:
          'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      }}
    >
      {/* Header h-12 : back icon + search | view tabs + zone filters + fullscreen */}
      <header className="h-12 shrink-0 border-b border-app-border flex items-center justify-between px-2 sm:px-4 bg-app-bg">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-app-elevated rounded-lg shrink-0" />
          <div className="h-5 w-24 bg-app-elevated rounded hidden sm:block" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-8 w-20 bg-app-elevated rounded-lg" />
          <div className="h-8 w-24 bg-app-elevated rounded-lg" />
          <div className="h-8 w-8 bg-app-elevated rounded-lg" />
        </div>
      </header>

      {/* Board : grille de tickets KDS */}
      <div className="flex-1 overflow-hidden p-2 sm:p-3">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 h-full">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-app-card border border-app-border rounded-xl p-4 flex flex-col gap-3 min-h-[320px]"
            >
              {/* Ticket header : order number + time badge */}
              <div className="flex items-center justify-between">
                <div className="h-5 w-16 bg-app-elevated rounded" />
                <div className="h-5 w-12 bg-app-elevated rounded-full" />
              </div>
              {/* Table / customer label */}
              <div className="h-3.5 w-28 bg-app-elevated rounded" />
              {/* Items list */}
              <div className="flex-1 flex flex-col gap-2 mt-1">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <div className="h-3.5 w-5 bg-app-elevated rounded shrink-0" />
                    <div className="h-3.5 flex-1 bg-app-elevated rounded" />
                  </div>
                ))}
              </div>
              {/* Action button */}
              <div className="h-9 w-full bg-app-elevated rounded-lg mt-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Footer h-14 : tenant name + status tabs */}
      <footer className="h-14 shrink-0 border-t border-app-border flex items-center px-4 gap-4 bg-app-card">
        <div className="h-4 w-28 bg-app-elevated rounded hidden sm:block" />
        <div className="flex items-center gap-1.5 flex-1 justify-center">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 w-16 bg-app-elevated rounded-lg" />
          ))}
        </div>
      </footer>
    </div>
  );
}
