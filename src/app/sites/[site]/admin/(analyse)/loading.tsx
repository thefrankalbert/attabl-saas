/**
 * Content-only skeleton for the Analyse tabs. The tab bar is rendered by the
 * (analyse) layout above this Suspense boundary, so it stays visible while this
 * shows. The header row and rhythm mirror AnalyseSectionHeader so nothing shifts
 * when the real content streams in.
 */
export default function AnalyseLoading() {
  return (
    <div className="flex flex-1 min-h-0 animate-pulse flex-col">
      {/* Header row: title + count */}
      <div className="shrink-0 space-y-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-40 rounded-md bg-app-elevated" />
            <div className="h-5 w-8 rounded-md bg-app-elevated" />
          </div>
          <div className="h-3.5 w-64 max-w-full rounded bg-app-elevated" />
        </div>
        {/* Toolbar / filter row */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-20 shrink-0 rounded-lg bg-app-elevated" />
          ))}
        </div>
      </div>

      {/* Content block */}
      <div className="mt-4 flex-1 space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-app-border/60 bg-app-card px-4 py-3.5"
          >
            <div className="h-9 w-9 shrink-0 rounded-lg bg-app-elevated" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-1/3 rounded bg-app-elevated" />
              <div className="h-3 w-1/4 rounded bg-app-elevated" />
            </div>
            <div className="h-3.5 w-16 shrink-0 rounded bg-app-elevated" />
          </div>
        ))}
      </div>
    </div>
  );
}
