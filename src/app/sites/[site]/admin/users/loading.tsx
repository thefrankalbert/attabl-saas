export default function UsersLoading() {
  return (
    <div className="h-full flex flex-col space-y-6 animate-pulse p-4 sm:p-6 lg:p-8">
      <div className="shrink-0 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 bg-app-elevated rounded shrink-0" />
          <div className="h-7 w-40 bg-app-elevated rounded" />
          <div className="h-9 w-36 bg-app-elevated rounded-lg ml-auto" />
        </div>
      </div>

      <div className="flex-1 border border-app-border rounded-xl overflow-hidden bg-app-card">
        <div className="divide-y divide-app-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-app-elevated rounded-full shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-4 w-32 bg-app-elevated rounded" />
                  <div className="h-3 w-44 bg-app-elevated rounded" />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="h-6 w-20 bg-app-elevated rounded-full" />
                <div className="h-4 w-24 bg-app-elevated rounded hidden sm:block" />
                <div className="h-8 w-8 bg-app-elevated rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
