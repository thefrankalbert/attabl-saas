export default function CategoriesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-neutral-100 rounded" />
        <div className="h-10 w-40 bg-neutral-100 rounded-lg" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 bg-neutral-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
