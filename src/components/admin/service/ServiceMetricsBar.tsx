// Pure presentational component - no hooks, no handlers. Dropping 'use client'
// lets Next inline it in the parent bundle without a separate boundary.
import { cn } from '@/lib/utils';
import type { ServiceTableVM } from './service.types';

interface Props {
  tables: ServiceTableVM[];
  avgDurationMin: number;
  labels: {
    occupationRate: string;
    waitTime: string;
    minShort: string;
    occupiedSummary: string;
    freeSummary: string;
    reservedSummary: string;
    cleaningSummary: string;
    activeAssignments: string;
    tablesTotal: string;
    coversLabel: string;
    coversSub: string;
  };
}

function Tile({
  label,
  value,
  unit,
  sub,
  barPct,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  barPct?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-1 border-r border-app-border/50 px-5 py-3.5 last:border-r-0',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.2px] text-app-text-muted">
        {label}
      </div>
      <div className="font-mono text-[22px] font-medium leading-[1.1] tracking-tight text-app-text">
        {value}
        {unit && <span className="ml-1 text-[13px] text-app-text-muted">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] text-app-text-muted">{sub}</div>}
      {typeof barPct === 'number' && (
        <div className="mt-1.5 h-[3px] overflow-hidden rounded-sm bg-app-elevated">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.min(100, Math.max(0, barPct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function ServiceMetricsBar({ tables, avgDurationMin, labels }: Props) {
  const total = tables.length;
  const occ = tables.filter((t) => t.status === 'occupied').length;
  const free = tables.filter((t) => t.status === 'free').length;
  const reserved = tables.filter((t) => t.status === 'reserved').length;
  const cleaning = tables.filter((t) => t.status === 'cleaning').length;
  const occPct = total > 0 ? Math.round((occ / total) * 100) : 0;
  const totalCovers = tables.reduce((sum, vm) => sum + (vm.table.capacity || 0), 0);
  const occupiedCovers = tables
    .filter((t) => t.status === 'occupied')
    .reduce((sum, vm) => sum + (vm.table.capacity || 0), 0);

  return (
    <div className="flex items-stretch border-b border-app-border/50 bg-app-bg">
      <Tile
        label={labels.occupationRate}
        value={String(occPct)}
        unit="%"
        sub={`${occ} ${labels.occupiedSummary} · ${free} ${labels.freeSummary}${reserved > 0 ? ` · ${reserved} ${labels.reservedSummary}` : ''}${cleaning > 0 ? ` · ${cleaning} ${labels.cleaningSummary}` : ''}`}
        barPct={occPct}
      />
      <Tile
        label={labels.waitTime}
        value={String(avgDurationMin)}
        unit={labels.minShort}
        sub={`${occ} ${labels.activeAssignments}`}
      />
      <Tile
        label={labels.coversLabel}
        value={String(occupiedCovers)}
        unit={`/${totalCovers}`}
        sub={labels.coversSub}
      />
      <Tile
        label={labels.tablesTotal}
        value={String(total)}
        sub={`${occ} ${labels.occupiedSummary} / ${total} ${labels.tablesTotal.toLowerCase()}`}
      />
    </div>
  );
}
