'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DashboardChannelSeries } from '@/types/dashboard.types';

type RangeKey = 'quarter' | 'month' | 'week';

interface RevenueChartLabels {
  title: string;
  desc: string;
  surplace: string;
  emporter: string;
  range90d: string;
  range30d: string;
  range7d: string;
  totalLabel: string;
}

interface RevenueChartProps {
  series: DashboardChannelSeries;
  formatValue: (n: number) => string;
  locale: string;
  labels: RevenueChartLabels;
}

export function RevenueChart({ series, formatValue, locale, labels }: RevenueChartProps) {
  const [range, setRange] = useState<RangeKey>('quarter');
  const data = useMemo(() => series[range] ?? [], [series, range]);

  const config: ChartConfig = useMemo(
    () => ({
      surplace: { label: labels.surplace, color: 'var(--c-surplace)' },
      emporter: { label: labels.emporter, color: 'var(--c-emporter)' },
    }),
    [labels.surplace, labels.emporter],
  );

  const total = useMemo(() => data.reduce((sum, b) => sum + b.surplace + b.emporter, 0), [data]);

  const hasData = total > 0;

  const formatTick = (value: string) => {
    const d = new Date(value);
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-[0_1px_2px_0_rgb(0_0_0/0.05)]">
      <div className="relative grid gap-1.5 px-6 pt-6">
        <div className="text-sm font-semibold">{labels.title}</div>
        <div className="text-[13px] text-[var(--muted-foreground)]">{labels.desc}</div>
        <div className="absolute right-6 top-6 flex items-center gap-3">
          <div className="hidden items-center gap-[14px] text-xs text-[var(--muted-foreground)] @lg:flex">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: 'var(--c-surplace)' }}
                aria-hidden
              />
              {labels.surplace}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: 'var(--c-emporter)' }}
                aria-hidden
              />
              {labels.emporter}
            </span>
          </div>
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(v) => {
              if (v) setRange(v as RangeKey);
            }}
            className="hidden overflow-hidden rounded-[var(--radius)] border border-[var(--input)] @md:inline-flex"
          >
            <ToggleGroupItem
              value="quarter"
              className="h-auto rounded-none border-0 border-r border-[var(--input)] px-3 py-[5px] text-[13px] data-[state=on]:bg-[var(--accent)] data-[state=on]:font-medium data-[state=on]:text-[var(--foreground)]"
            >
              {labels.range90d}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="month"
              className="h-auto rounded-none border-0 border-r border-[var(--input)] px-3 py-[5px] text-[13px] data-[state=on]:bg-[var(--accent)] data-[state=on]:font-medium data-[state=on]:text-[var(--foreground)]"
            >
              {labels.range30d}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="week"
              className="h-auto rounded-none border-0 px-3 py-[5px] text-[13px] data-[state=on]:bg-[var(--accent)] data-[state=on]:font-medium data-[state=on]:text-[var(--foreground)]"
            >
              {labels.range7d}
            </ToggleGroupItem>
          </ToggleGroup>
          {/* Mobile: maquette swaps the toggle for a compact select under 768px */}
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="h-8 w-[140px] text-[13px] @md:hidden">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quarter">{labels.range90d}</SelectItem>
              <SelectItem value="month">{labels.range30d}</SelectItem>
              <SelectItem value="week">{labels.range7d}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="px-6 pb-6 pt-2">
        {hasData ? (
          <ChartContainer config={config} className="h-[250px] w-full">
            <AreaChart data={data} margin={{ left: 4, right: 8, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="fillSurplace" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-surplace)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-surplace)" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="fillEmporter" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-emporter)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-emporter)" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={formatTick}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    className="min-w-[150px] rounded-[var(--radius)]"
                    labelFormatter={(value) => formatTick(String(value))}
                    formatter={(val) => formatValue(Number(val))}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="surplace"
                name={labels.surplace}
                type="natural"
                fill="url(#fillSurplace)"
                stroke="var(--color-surplace)"
                strokeWidth={1.5}
                stackId="a"
              />
              <Area
                dataKey="emporter"
                name={labels.emporter}
                type="natural"
                fill="url(#fillEmporter)"
                stroke="var(--color-emporter)"
                strokeWidth={1.5}
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="flex h-[250px] items-center justify-center text-[13px] text-[var(--muted-foreground)]">
            {labels.desc}
          </div>
        )}
      </div>
    </div>
  );
}
