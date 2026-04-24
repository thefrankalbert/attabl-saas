export default function SubscriptionLoading() {
  return (
    <div className="h-full flex flex-col animate-pulse p-4 sm:p-6 lg:p-8 space-y-4">
      {/* Tab pills */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="h-8 w-24 bg-app-elevated rounded-lg" />
        <div className="h-8 w-28 bg-app-elevated rounded-lg" />
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 space-y-4">
        {/* Plan status card */}
        <div className="bg-app-card border border-app-border rounded-xl p-6 space-y-4">
          {/* Card header */}
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-app-elevated rounded" />
            <div className="h-5 w-44 bg-app-elevated rounded" />
          </div>
          {/* Plan name + status badge */}
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="h-3.5 w-12 bg-app-elevated rounded" />
              <div className="h-8 w-28 bg-app-elevated rounded" />
            </div>
            <div className="h-6 w-16 bg-app-elevated rounded-full" />
          </div>
          {/* Billing cycle */}
          <div className="space-y-1.5">
            <div className="h-3.5 w-20 bg-app-elevated rounded" />
            <div className="h-4 w-24 bg-app-elevated rounded" />
          </div>
          {/* Renewal date */}
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 bg-app-elevated rounded" />
            <div className="h-4 w-32 bg-app-elevated rounded" />
          </div>
        </div>

        {/* Usage limits card */}
        <div className="bg-app-card border border-app-border rounded-xl p-6 space-y-4">
          <div className="h-5 w-36 bg-app-elevated rounded" />
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 bg-app-elevated rounded" />
              <div className="h-4 w-10 bg-app-elevated rounded" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-4 w-20 bg-app-elevated rounded" />
              <div className="h-4 w-10 bg-app-elevated rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
