'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type MetricKey = 'revenue' | 'items' | 'orders' | 'tables';

export interface MetricDescriptor {
  key: MetricKey;
  label: string;
  value: string;
  unit?: string;
  /** Compared-to-previous context line. Example: "vs hier - 23 200 FCFA" */
  compareText?: string;
  /** Delta in percent. Positive => up, negative => down, 0/undefined => flat */
  deltaPercent?: number;
  /** Optional sparkline values normalized on their own scale */
  sparkline?: number[];
  /** Whether this metric should pulse a lime dot (live) */
  live?: boolean;
}

interface MetricsRowProps {
  metrics: MetricDescriptor[];
  activeKey: MetricKey;
  onSelect?: (key: MetricKey) => void;
  tUp: string;
  tDown: string;
}

function buildSparklinePath(values: number[], width = 52, height = 18) {
  if (values.length < 2) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return points;
}

export function MetricsRow({ metrics, activeKey, onSelect, tUp, tDown }: MetricsRowProps) {
  return (
    <div className="grid grid-cols-2 @md:grid-cols-4 border border-app-border rounded-[10px] bg-app-card overflow-hidden">
      {metrics.map((m, idx) => {
        const isActive = m.key === activeKey;
        const delta = m.deltaPercent ?? 0;
        const deltaLabel =
          delta > 0
            ? `${tUp} ${Math.abs(delta)}%`
            : delta < 0
              ? `${tDown} ${Math.abs(delta)}%`
              : '·';
        const deltaClass =
          delta > 0
            ? 'bg-accent-muted text-accent'
            : delta < 0
              ? 'bg-status-error-bg text-status-error'
              : 'bg-app-elevated text-app-text-secondary';

        return (
          <Button
            key={m.key}
            type="button"
            variant="ghost"
            onClick={() => onSelect?.(m.key)}
            className={cn(
              'relative h-auto flex-col items-stretch justify-start rounded-none text-left px-3 @sm:px-4 py-2 transition-colors group cursor-pointer shadow-none font-normal',
              'border-app-border',
              idx < metrics.length - 1 && '@md:border-r',
              idx % 2 === 0 && 'border-r @md:border-r',
              idx < 2 && 'border-b @md:border-b-0',
              isActive ? 'bg-app-elevated' : 'hover:bg-app-elevated/70',
            )}
          >
            {isActive && (
              <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" aria-hidden />
            )}

            <div className="flex items-center gap-2 mb-1">
              <span
                className={cn(
                  'w-[5px] h-[5px] rounded-full',
                  m.live ? 'bg-accent admin-pulse' : 'bg-app-text-muted',
                )}
                aria-hidden
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-app-text-muted">
                {m.label}
              </span>
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-[18px] @lg:text-[22px] leading-none font-medium tracking-tight text-app-text tabular-nums">
                {m.value}
              </span>
              {m.unit && (
                <span className="font-mono text-[12px] text-app-text-muted">{m.unit}</span>
              )}
            </div>

            <div className="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-app-text-muted">
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none',
                  deltaClass,
                )}
              >
                {delta > 0 ? '▲' : delta < 0 ? '▼' : '●'}
                {delta !== 0 && <span>{Math.abs(delta)}%</span>}
              </span>
            </div>

            {m.sparkline && m.sparkline.length > 1 && (
              <svg
                className="absolute right-3 bottom-2 opacity-60 pointer-events-none"
                width="52"
                height="18"
                viewBox="0 0 52 18"
                aria-hidden
              >
                <polyline
                  fill="none"
                  stroke={isActive ? 'var(--app-accent)' : 'var(--app-text-muted)'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={buildSparklinePath(m.sparkline)}
                />
              </svg>
            )}
            <span className="sr-only">
              {deltaLabel}
              {m.compareText ? ` - ${m.compareText}` : ''}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
