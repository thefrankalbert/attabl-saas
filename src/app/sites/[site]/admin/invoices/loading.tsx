export default function InvoicesLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      <div className="h-9 w-full bg-app-elevated rounded-lg mb-6" />

      <div className="shrink-0 flex items-center gap-3 mb-4">
        <div className="h-7 w-36 bg-app-elevated rounded" />
        <div className="h-5 w-10 bg-app-elevated rounded-md" />
      </div>

      <div className="flex-1 bg-app-card rounded-xl border border-app-border overflow-hidden">
        <div className="h-11 bg-app-bg/50 border-b border-app-border" />
        <div className="divide-y divide-app-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-24 bg-app-elevated rounded shrink-0" />
              <div className="h-4 w-20 bg-app-elevated rounded shrink-0" />
              <div className="h-4 w-36 bg-app-elevated rounded hidden sm:block shrink-0" />
              <div className="h-4 w-16 bg-app-elevated rounded ml-auto shrink-0" />
              <div className="h-5 w-14 bg-app-elevated rounded-full shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                <div className="h-8 w-12 bg-app-elevated rounded" />
                <div className="h-8 w-14 bg-app-elevated rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
