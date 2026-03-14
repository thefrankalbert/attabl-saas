export default function InvoicesLoading() {
  return (
    <div className="max-w-7xl mx-auto animate-pulse">
      <div className="h-8 w-48 bg-app-elevated rounded-lg mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-app-elevated rounded-xl" />
        ))}
      </div>
    </div>
  );
}
