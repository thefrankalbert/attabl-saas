export default function CouponsLoading() {
  return (
    <div className="h-full flex flex-col space-y-6 animate-pulse p-4 sm:p-6 lg:p-8">
      <div className="shrink-0 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 bg-app-elevated rounded shrink-0" />
          <div className="h-7 w-28 bg-app-elevated rounded" />
          <div className="h-9 w-32 bg-app-elevated rounded-lg ml-auto" />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-app-card rounded-xl border border-app-border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex items-center gap-2 flex-1">
                  <div className="h-4 w-4 bg-app-elevated rounded shrink-0" />
                  <div className="h-4 w-32 bg-app-elevated rounded font-mono" />
                </div>
                <div className="h-5 w-14 bg-app-elevated rounded-full shrink-0" />
                <div className="h-4 w-16 bg-app-elevated rounded shrink-0" />
                <div className="h-4 w-12 bg-app-elevated rounded shrink-0" />
                <div className="h-6 w-16 bg-app-elevated rounded-full shrink-0" />
                <div className="h-8 w-8 bg-app-elevated rounded-lg shrink-0 ml-auto sm:ml-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
