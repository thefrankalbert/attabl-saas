'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChartDataPoint, ChartMode, ChartPeriod } from '@/types/command-center.types';

interface ChartPanelMinimalProps {
  data: ChartDataPoint[];
  mode: ChartMode;
  period: ChartPeriod;
  onModeChange: (mode: ChartMode) => void;
  onPeriodChange: (period: ChartPeriod) => void;
}

const W = 800;
const H = 260;
const PAD_L = 40;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 24;

function formatMoney(v: number): string {
  return v.toLocaleString('fr-FR');
}

export function ChartPanelMinimal({
  data,
  mode,
  period,
  onModeChange,
  onPeriodChange,
}: ChartPanelMinimalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const hasEnoughData = data.length >= 2;

  const { values, labels, paths, xFor, yFor, innerH } = useMemo(() => {
    const vals = data.map((p) => (mode === 'orders' ? p.orders : p.revenue));
    const lbls = data.map((p) => p.label);
    const iw = W - PAD_L - PAD_R;
    const ih = H - PAD_T - PAD_B;
    const max = Math.max(...vals, 1);

    const xForFn = (i: number) => PAD_L + (i / Math.max(vals.length - 1, 1)) * iw;
    const yForFn = (v: number) => PAD_T + ih - (v / max) * ih;

    const linePts =
      vals.length >= 2
        ? vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xForFn(i)} ${yForFn(v)}`).join(' ')
        : '';
    const areaPts =
      vals.length >= 2
        ? `${linePts} L ${xForFn(vals.length - 1)} ${PAD_T + ih} L ${xForFn(0)} ${PAD_T + ih} Z`
        : '';

    return {
      values: vals,
      labels: lbls,
      paths: { line: linePts, area: areaPts },
      xFor: xForFn,
      yFor: yForFn,
      innerH: ih,
    };
  }, [data, mode]);

  const tickIndices = useMemo(() => {
    if (data.length === 0) return [];
    if (data.length <= 5) return data.map((_, i) => i);
    const step = Math.max(1, Math.floor(data.length / 4));
    const set = new Set<number>([0, data.length - 1]);
    for (let i = step; i < data.length - 1; i += step) set.add(i);
    return Array.from(set).sort((a, b) => a - b);
  }, [data]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hostRef.current || values.length === 0) return;
    const rect = hostRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const relX = (mx / rect.width) * W;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < values.length; i++) {
      const d = Math.abs(xFor(i) - relX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
  };

  const onLeave = () => setHoverIndex(null);

  const hovered = hoverIndex !== null ? values[hoverIndex] : null;
  const hoveredLabel = hoverIndex !== null ? labels[hoverIndex] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div
          className="text-[12px] font-medium tracking-[0.02em]"
          style={{ color: 'var(--cc-text-2)' }}
        >
          {period === 'day'
            ? 'Heure par heure'
            : period === 'week'
              ? 'Sept derniers jours'
              : 'Ce mois-ci'}
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            value={mode}
            options={[
              { key: 'revenue' as const, label: 'CA' },
              { key: 'orders' as const, label: 'Commandes' },
            ]}
            onChange={onModeChange}
          />
          <Segmented
            value={period}
            options={[
              { key: 'day' as const, label: 'Jour' },
              { key: 'week' as const, label: '7j' },
              { key: 'month' as const, label: 'Mois' },
            ]}
            onChange={onPeriodChange}
          />
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1"
        ref={hostRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {!hasEnoughData && (
          <div
            className="absolute inset-0 flex items-center justify-center text-[12px]"
            style={{ color: 'var(--cc-text-3)' }}
          >
            Pas encore assez de donnees
          </div>
        )}
        <svg
          className="block h-full w-full overflow-visible"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="cc-area-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--cc-accent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--cc-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="cc-chart-grid">
            {[0, 1, 2, 3].map((i) => {
              const y = PAD_T + (i / 3) * innerH;
              return <line key={i} x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} />;
            })}
          </g>
          <g className="cc-chart-axis">
            {tickIndices.map((i) => (
              <text key={i} x={xFor(i)} y={H - 6} textAnchor="middle">
                {labels[i]}
              </text>
            ))}
          </g>
          {hasEnoughData && <path d={paths.area} className="cc-chart-area" />}
          {hasEnoughData && <path d={paths.line} className="cc-chart-line" />}
          {hasEnoughData && hoverIndex !== null && hovered !== null && (
            <>
              <line
                x1={xFor(hoverIndex)}
                x2={xFor(hoverIndex)}
                y1={PAD_T}
                y2={PAD_T + innerH}
                className="cc-crosshair-x"
              />
              <circle cx={xFor(hoverIndex)} cy={yFor(hovered)} r={4} className="cc-crosshair-dot" />
            </>
          )}
        </svg>

        {hoverIndex !== null && hovered !== null && (
          <div
            className={cn('cc-tooltip cc-show')}
            style={{
              left: `calc(${(xFor(hoverIndex) / W) * 100}%)`,
              top: `calc(${(yFor(hovered) / H) * 100}%)`,
            }}
          >
            <div className="cc-t-time">{hoveredLabel}</div>
            <div className="cc-t-val">
              {mode === 'orders' ? `${hovered} cmd.` : `${formatMoney(hovered)} F`}
            </div>
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
    <div
      className="inline-flex gap-0.5 rounded-md p-0.5"
      style={{ background: 'var(--cc-surface-2)' }}
    >
      {options.map((opt) => (
        <Button
          key={opt.key}
          type="button"
          variant="ghost"
          onClick={() => onChange(opt.key)}
          className={cn(
            'h-auto whitespace-nowrap rounded px-2.5 py-[3px] text-[11.5px] font-medium shadow-none',
          )}
          style={
            value === opt.key
              ? {
                  background: 'var(--cc-surface)',
                  color: 'var(--cc-text)',
                  boxShadow: '0 0 0 1px var(--cc-border)',
                }
              : { color: 'var(--cc-text-3)' }
          }
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
