export default function AuditLogsLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8">
      <div className="h-9 w-full bg-app-elevated rounded-lg mb-6" />

      <div className="shrink-0 flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-40 bg-app-elevated rounded" />
          <div className="h-5 w-10 bg-app-elevated rounded-md" />
          <div className="h-9 w-28 bg-app-elevated rounded-lg ml-auto" />
        </div>
      </div>

      <div className="flex-1 bg-app-card rounded-xl border border-app-border overflow-hidden">
        <div className="h-11 bg-app-bg/50 border-b border-app-border" />
        <div className="divide-y divide-app-border">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-28 bg-app-elevated rounded shrink-0" />
              <div className="flex-1 h-4 bg-app-elevated rounded" />
              <div className="h-5 w-16 bg-app-elevated rounded-full shrink-0" />
              <div className="h-4 w-20 bg-app-elevated rounded shrink-0" />
              <div className="h-3 w-40 bg-app-elevated rounded hidden sm:block shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
