// --- Section Helper -----------------------------------

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-app-text">{title}</h3>
      {children}
    </div>
  );
}
