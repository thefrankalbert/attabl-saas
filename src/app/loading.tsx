/**
 * Root loading fallback. Covers heterogeneous routes (marketing, auth, admin,
 * storefront) before a route-specific loading.tsx takes over, so it stays a
 * neutral, non-committal page skeleton rather than a spinner.
 */
export default function Loading() {
  return (
    <div className="min-h-dvh bg-app-bg animate-pulse">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-app-border px-4 py-4 sm:px-6">
        <div className="h-6 w-28 rounded bg-app-elevated" />
        <div className="h-8 w-8 rounded-full bg-app-elevated" />
      </div>
      {/* Content lines */}
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
        <div className="h-8 w-2/3 rounded bg-app-elevated" />
        <div className="h-4 w-full rounded bg-app-elevated/60" />
        <div className="h-4 w-5/6 rounded bg-app-elevated/60" />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="h-28 rounded-xl bg-app-elevated/40" />
          <div className="h-28 rounded-xl bg-app-elevated/40" />
        </div>
      </div>
    </div>
  );
}
