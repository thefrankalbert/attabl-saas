export default function CategoriesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-app-elevated rounded" />
        <div className="h-10 w-40 bg-app-elevated rounded-lg" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 bg-app-elevated rounded-[10px]" />
        ))}
      </div>
    </div>
  );
}
