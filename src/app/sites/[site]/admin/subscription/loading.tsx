export default function SubscriptionLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-36 bg-app-elevated rounded" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-app-elevated rounded-xl" />
        <div className="h-64 bg-app-elevated rounded-xl" />
      </div>
    </div>
  );
}
