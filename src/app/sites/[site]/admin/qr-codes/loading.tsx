export default function QRCodesLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      {/* Header : icon + title + subtitle */}
      <div className="mb-6 shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 bg-app-elevated rounded-xl shrink-0" />
          <div className="h-6 w-40 bg-app-elevated rounded" />
        </div>
        <div className="h-3.5 w-64 bg-app-elevated rounded ml-12" />
      </div>

      {/* Tabs bar : Choose / Customize / Download */}
      <div className="flex gap-1 border-b border-app-border pb-px mb-5 shrink-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-28 bg-app-elevated rounded-t-lg" />
        ))}
      </div>

      {/* Tab content (Choose tab active state) */}
      <div className="flex-1 flex flex-col gap-5 overflow-hidden">
        {/* Info banner */}
        <div className="h-14 w-full bg-app-elevated/40 border border-app-border rounded-xl shrink-0" />

        {/* Selectors card */}
        <div className="bg-app-card border border-app-border rounded-xl p-5 shrink-0">
          <div className="h-4 w-40 bg-app-elevated rounded mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="h-3.5 w-16 bg-app-elevated rounded" />
              <div className="h-9 w-full bg-app-elevated rounded-lg" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="h-3.5 w-16 bg-app-elevated rounded" />
              <div className="h-9 w-full bg-app-elevated rounded-lg" />
            </div>
          </div>
        </div>

        {/* Selection summary card */}
        <div className="bg-app-bg border border-app-border rounded-xl p-4 shrink-0">
          <div className="h-3 w-32 bg-app-elevated rounded mb-3" />
          <div className="flex gap-4">
            <div className="h-4 w-28 bg-app-elevated rounded" />
            <div className="h-4 w-28 bg-app-elevated rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
