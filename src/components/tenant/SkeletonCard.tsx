export default function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-neutral-100 p-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-24 h-24 rounded-xl bg-neutral-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-neutral-100 rounded-lg w-3/4" />
          <div className="h-3 bg-neutral-100 rounded-lg w-full" />
          <div className="h-3 bg-neutral-100 rounded-lg w-1/2" />
          <div className="h-4 bg-neutral-100 rounded-lg w-1/4 mt-3" />
        </div>
      </div>
    </div>
  );
}
