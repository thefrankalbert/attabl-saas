export default function AnnouncementsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-app-elevated rounded" />
        <div className="h-10 w-40 bg-app-elevated rounded-lg" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-app-elevated rounded-[10px]" />
        ))}
      </div>
    </div>
  );
}
