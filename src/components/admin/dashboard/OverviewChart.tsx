'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type ChartMetric = 'revenue' | 'orders';
export type ChartRange = 'week' | 'month' | 'quarter';

export interface SeriesPoint {
  label: string;
  value: number;
  prev?: number;
}

interface OverviewChartProps {
  metric: ChartMetric;
  onMetricChange: (m: ChartMetric) => void;
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  series: SeriesPoint[];
  total: number;
  formatValue: (n: number) => string;
  totalLabel: string;
  legendCurrent: string;
  legendPrev: string;
  revenueLabel: string;
  ordersLabel: string;
  rangeLabels: Record<ChartRange, string>;
  title: string;
}

const W = 800;
const H = 260;
const PAD = { l: 44, r: 18, t: 18, b: 28 };

function buildSmoothPath(
  values: number[],
  xFor: (i: number) => number,
  yFor: (v: number) => number,
) {
  if (values.length < 2) return '';
  let d = `M ${xFor(0)} ${yFor(values[0])}`;
  for (let i = 1; i < values.length; i++) {
    const xc = (xFor(i - 1) + xFor(i)) / 2;
    const yc = (yFor(values[i - 1]) + yFor(values[i])) / 2;
    d += ` Q ${xFor(i - 1)} ${yFor(values[i - 1])} ${xc} ${yc}`;
  }
  d += ` T ${xFor(values.length - 1)} ${yFor(values[values.length - 1])}`;
  return d;
}

export function OverviewChart({
  metric,
  onMetricChange,
  range,
  onRangeChange,
  series,
  total,
  formatValue,
  totalLabel,
  legendCurrent,
  legendPrev,
  revenueLabel,
  ordersLabel,
  rangeLabels,
  title,
}: OverviewChartProps) {
  const hostRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const gradientId = useId();

  const { values, innerW, innerH, xFor, yFor, linePath, prevPath, areaPath, yTicks } =
    useMemo(() => {
      const values = series.map((p) => p.value);
      const prev = series.map((p) => p.prev ?? 0);
      const innerW = W - PAD.l - PAD.r;
      const innerH = H - PAD.t - PAD.b;
      const maxY = Math.max(...values, ...prev, 1) * 1.1;

      const xFor = (i: number) => PAD.l + (i / Math.max(values.length - 1, 1)) * innerW;
      const yFor = (v: number) => PAD.t + innerH - (v / maxY) * innerH;

      const linePath = buildSmoothPath(values, xFor, yFor);
      const prevPath = buildSmoothPath(prev, xFor, yFor);
      const areaPath =
        linePath +
        ` L ${xFor(values.length - 1)} ${PAD.t + innerH} L ${xFor(0)} ${PAD.t + innerH} Z`;

      const yTicks = 4;
      return { values, innerW, innerH, xFor, yFor, linePath, prevPath, areaPath, yTicks };
    }, [series]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;
    if (mx < PAD.l || mx > W - PAD.r) {
      setHoverIndex(null);
      return;
    }
    const relIdx = ((mx - PAD.l) / innerW) * Math.max(values.length - 1, 1);
    setHoverIndex(Math.round(relIdx));
  };

  const onLeave = () => setHoverIndex(null);

  const hovered = hoverIndex !== null ? series[hoverIndex] : null;
  const hoveredDelta =
    hovered && hovered.prev ? Math.round(((hovered.value - hovered.prev) / hovered.prev) * 100) : 0;

  return (
    <div className="rounded-[10px] border border-app-border bg-app-card overflow-hidden flex flex-col">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-app-border flex-wrap">
        <div className="flex items-center gap-2 text-[13px] font-medium text-app-text">
          <Activity className="w-[13px] h-[13px] text-app-text-muted" />
          <span>{title}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Segmented
            value={metric}
            options={[
              { key: 'revenue', label: revenueLabel },
              { key: 'orders', label: ordersLabel },
            ]}
            onChange={onMetricChange}
          />
          <Segmented
            value={range}
            options={[
              { key: 'week', label: rangeLabels.week },
              { key: 'month', label: rangeLabels.month },
              { key: 'quarter', label: rangeLabels.quarter },
            ]}
            onChange={onRangeChange}
          />
        </div>
      </div>

      <div className="px-4 pt-3 pb-5 relative overflow-hidden">
        <div className="flex items-center gap-4 font-mono text-[11px] text-app-text-muted pb-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-[2px] bg-accent" />
            {legendCurrent}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-[2px] bg-app-text-muted" />
            {legendPrev}
          </span>
          <span className="ml-auto">
            {totalLabel}:{' '}
            <span className="text-app-text tabular-nums">
              {metric === 'revenue' ? formatValue(total) : total}
            </span>
          </span>
        </div>

        <svg
          ref={hostRef}
          className="w-full h-[200px] @lg:h-[260px] block"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={onMove}
          onMouseLeave={onLeave}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--app-accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--app-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {Array.from({ length: yTicks + 1 }).map((_, i) => {
            const y = PAD.t + (i / yTicks) * innerH;
            return (
              <line
                key={`grid-${i}`}
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y}
                y2={y}
                stroke="var(--app-border)"
                strokeDasharray="2 4"
              />
            );
          })}

          {series.map((pt, i) => (
            <text
              key={`x-${i}`}
              x={xFor(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fontFamily="var(--font-geist-mono)"
              fill="var(--app-text-muted)"
            >
              {pt.label}
            </text>
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={prevPath}
            fill="none"
            stroke="var(--app-text-muted)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.5"
          />
          <path
            d={linePath}
            fill="none"
            stroke="var(--app-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {hoverIndex !== null && (
            <>
              <line
                x1={xFor(hoverIndex)}
                x2={xFor(hoverIndex)}
                y1={PAD.t}
                y2={PAD.t + innerH}
                stroke="var(--app-border-hover)"
                strokeDasharray="3 3"
              />
              <circle
                cx={xFor(hoverIndex)}
                cy={yFor(values[hoverIndex])}
                r="4"
                fill="var(--app-accent)"
                stroke="var(--app-bg)"
                strokeWidth="2"
              />
            </>
          )}
        </svg>

        {hovered && hoverIndex !== null && (
          <div
            className="absolute pointer-events-none rounded-md border border-app-border-hover bg-app-elevated px-2.5 py-2 text-[11px] shadow-lg"
            style={{
              left: `calc(${(xFor(hoverIndex) / W) * 100}% + 12px)`,
              top: `calc(${(yFor(values[hoverIndex]) / H) * 100}% - 20px)`,
              minWidth: 140,
            }}
          >
            <div className="font-mono text-[10px] text-app-text-muted">{hovered.label}</div>
            <div className="text-[15px] font-medium text-app-text tabular-nums mt-0.5">
              {metric === 'revenue' ? formatValue(hovered.value) : `${hovered.value}`}
            </div>
            {hovered.prev !== undefined && hovered.prev > 0 && (
              <div className="text-[10px] text-app-text-muted font-mono mt-1">
                {hoveredDelta >= 0 ? '▲' : '▼'} {Math.abs(hoveredDelta)}% ·{' '}
                {formatValue(hovered.prev)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface SegmentedProps<K extends string> {
  value: K;
  options: { key: K; label: string }[];
  onChange: (next: K) => void;
}

function Segmented<K extends string>({ value, options, onChange }: SegmentedProps<K>) {
  return (
    <div className="inline-flex p-[2px] rounded-md bg-app-bg border border-app-border">
      {options.map((o) => (
        <Button
          key={o.key}
          type="button"
          variant="ghost"
          onClick={() => onChange(o.key)}
          className={cn(
            'font-mono text-[11px] tracking-wide px-2.5 py-1 h-auto rounded-[5px] transition-colors shadow-none font-normal',
            value === o.key
              ? 'bg-app-elevated text-app-text'
              : 'text-app-text-muted hover:text-app-text-secondary',
          )}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
