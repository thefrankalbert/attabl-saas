export default function OrderDetailLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      {/* Back button + order title */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <div className="h-7 w-7 bg-app-elevated rounded-md shrink-0" />
        <div className="h-4 w-48 bg-app-elevated rounded" />
      </div>

      {/* Body: left (info + items) + right (actions panel) */}
      <div className="flex flex-col @md:flex-row gap-4 flex-1 min-h-0">
        {/* Left: status bar, info chips, items list */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Status + total + time row */}
          <div className="shrink-0 space-y-3 mb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="h-5 w-20 bg-app-elevated rounded-full" />
              <div className="h-6 w-24 bg-app-elevated rounded ml-auto" />
              <div className="h-3 w-28 bg-app-elevated/60 rounded" />
            </div>

            {/* Info chips row */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="h-5 w-16 bg-app-elevated rounded-md" />
              <div className="h-5 w-24 bg-app-elevated rounded-md" />
              <div className="h-5 w-20 bg-app-elevated rounded-md" />
            </div>
          </div>

          {/* Items list card */}
          <div className="rounded-xl border border-app-border flex flex-col min-h-0 flex-1 overflow-hidden">
            <div className="px-3 py-2 bg-app-bg/50 border-b border-app-border flex items-center justify-between shrink-0">
              <div className="h-3 w-20 bg-app-elevated rounded" />
              <div className="h-3 w-12 bg-app-elevated/60 rounded" />
            </div>
            <div className="divide-y divide-app-border flex-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between items-start px-3 py-2.5">
                  <div className="flex gap-2 flex-1 min-w-0">
                    <div className="w-5 h-5 bg-app-elevated rounded shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-36 bg-app-elevated rounded" />
                      {i === 1 && <div className="h-2.5 w-24 bg-app-elevated/60 rounded" />}
                    </div>
                  </div>
                  <div className="h-3.5 w-14 bg-app-elevated rounded" />
                </div>
              ))}
            </div>
            {/* Price breakdown footer */}
            <div className="border-t border-app-border px-3 py-2 space-y-1.5 shrink-0 bg-app-bg">
              <div className="flex justify-between">
                <div className="h-3 w-14 bg-app-elevated/60 rounded" />
                <div className="h-3 w-16 bg-app-elevated/60 rounded" />
              </div>
              <div className="flex justify-between pt-1 border-t border-app-border">
                <div className="h-3.5 w-10 bg-app-elevated rounded" />
                <div className="h-3.5 w-20 bg-app-elevated rounded" />
              </div>
            </div>
          </div>
        </div>

        {/* Right: actions panel */}
        <div className="@lg:w-56 shrink-0 space-y-3">
          {/* Status actions */}
          <div className="rounded-xl border border-app-border bg-app-card p-3 space-y-2">
            <div className="h-3 w-20 bg-app-elevated rounded" />
            <div className="h-8 w-full bg-app-elevated rounded-md" />
            <div className="h-8 w-full bg-app-elevated rounded-md" />
            <div className="h-8 w-full bg-app-elevated rounded-md" />
          </div>

          {/* Print actions */}
          <div className="rounded-xl border border-app-border bg-app-card p-3 space-y-2">
            <div className="h-3 w-16 bg-app-elevated rounded" />
            <div className="h-8 w-full bg-app-elevated rounded-md" />
            <div className="h-8 w-full bg-app-elevated rounded-md" />
          </div>

          {/* Payment action */}
          <div className="h-10 w-full bg-app-elevated rounded-lg" />
        </div>
      </div>
    </div>
  );
}
