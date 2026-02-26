export default function SettingsLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-7 w-36 bg-neutral-100 rounded" />
        <div className="h-4 w-64 bg-neutral-100 rounded mt-2" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-100 pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-28 bg-neutral-100 rounded-lg" />
        ))}
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 bg-neutral-100 rounded" />
            <div className="h-10 w-full bg-neutral-100 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Save button */}
      <div className="h-10 w-32 bg-neutral-100 rounded-lg" />
    </div>
  );
}
