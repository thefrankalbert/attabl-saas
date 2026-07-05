/* -- Compact info chip ---------------------------------- */
export function InfoChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label?: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-bg px-2 py-0.5 text-app-text">
      {icon}
      {label && <span className="text-app-text-muted">{label}:</span>}
      <span className="font-medium">{value}</span>
    </span>
  );
}
