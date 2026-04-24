'use client';

import { useMemo, useState } from 'react';
import { Search, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface TopDish {
  id: string;
  name: string;
  subline: string;
  category: string;
  categoryLabel: string;
  portions: number;
  revenue: number;
  trend: number[];
  color: 'lime' | 'indigo' | 'rose' | 'amber';
  initials: string;
  available: boolean;
}

interface TopDishesCardProps {
  dishes: TopDish[];
  formatValue: (n: number) => string;
  title: string;
  rangeBadge: string;
  placeholder: string;
  tabAll: string;
  tabs: { key: string; label: string }[];
  headers: {
    dish: string;
    portions: string;
    revenue: string;
    category: string;
    status: string;
    trend: string;
  };
  availableLabel: string;
  unavailableLabel: string;
  emptyLabel: string;
}

const COLOR_CLASS: Record<TopDish['color'], string> = {
  lime: 'bg-accent text-[var(--app-accent-text)] border-accent',
  indigo: 'bg-indigo-600 text-white border-indigo-600',
  rose: 'bg-rose-600 text-white border-rose-600',
  amber: 'bg-amber-600 text-white border-amber-600',
};

function sparkPoints(trend: number[], width = 72, height = 22) {
  if (trend.length < 2) return '';
  const max = Math.max(...trend);
  const min = Math.min(...trend);
  const range = max - min || 1;
  return trend
    .map((v, i) => {
      const x = (i / (trend.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function TopDishesCard({
  dishes,
  formatValue,
  title,
  rangeBadge,
  placeholder,
  tabAll,
  tabs,
  headers,
  availableLabel,
  unavailableLabel,
  emptyLabel,
}: TopDishesCardProps) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dishes.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q) && !d.subline.toLowerCase().includes(q)) {
        return false;
      }
      if (activeTab !== 'all' && d.category !== activeTab) return false;
      return true;
    });
  }, [dishes, query, activeTab]);

  const allTabs = [{ key: 'all', label: tabAll }, ...tabs];

  return (
    <div className="rounded-[10px] border border-app-border bg-app-card overflow-hidden flex flex-col">
      {/* Header: title, search (filters the dish list by name), tabs.
          On mobile the three groups wrap to stay readable; on lg+ they
          stay on a single line to save vertical space. The search input
          narrows on lg+ to keep everything on one line at common widths. */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-app-border flex-wrap @md:flex-nowrap">
        <div className="flex items-center gap-2 text-[13px] font-medium text-app-text shrink-0">
          <UtensilsCrossed className="w-[13px] h-[13px] text-app-text-muted" />
          <span>{title}</span>
          <span className="font-mono text-[11px] text-app-text-muted px-1.5 py-0.5 bg-app-elevated rounded">
            {rangeBadge}
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-app-bg border border-app-border px-2.5 py-1 rounded-md text-xs text-app-text-secondary min-w-0">
          <Search className="w-3 h-3 text-app-text-muted shrink-0" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="bg-transparent border-none outline-none text-app-text placeholder:text-app-text-muted text-xs w-[180px] @lg:w-[140px] h-auto p-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="ml-auto inline-flex p-[2px] rounded-md bg-app-bg border border-app-border shrink-0">
          {allTabs.map((t) => (
            <Button
              key={t.key}
              type="button"
              variant="ghost"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'font-mono text-[11px] px-2.5 py-1 h-auto rounded-[5px] transition-colors shadow-none font-normal',
                activeTab === t.key
                  ? 'bg-app-elevated text-app-text'
                  : 'text-app-text-muted hover:text-app-text-secondary',
              )}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[540px]">
          <div className="grid grid-cols-[36px_1.5fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2 border-b border-app-border bg-white/[0.015] font-mono text-[10px] uppercase tracking-[0.08em] text-app-text-muted">
            <div />
            <div>{headers.dish}</div>
            <div>{headers.portions}</div>
            <div>{headers.revenue}</div>
            <div>{headers.category}</div>
            <div>{headers.status}</div>
            <div>{headers.trend}</div>
          </div>

          {filtered.length === 0 ? (
            <div className="px-5 py-6 text-center text-[13px] text-app-text-muted">
              {emptyLabel}
            </div>
          ) : (
            filtered.map((d) => (
              <div
                key={d.id}
                className="grid grid-cols-[36px_1.5fr_1fr_1fr_1fr_1fr_auto] gap-3 items-center px-4 py-3 border-b border-app-border last:border-b-0 hover:bg-app-elevated/70 transition-colors cursor-pointer"
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg border grid place-items-center font-mono text-[11px] font-semibold',
                    COLOR_CLASS[d.color],
                  )}
                >
                  {d.initials}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-app-text truncate">{d.name}</div>
                  <div className="font-mono text-[11px] text-app-text-muted truncate">
                    {d.subline}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[13px] text-app-text tabular-nums">
                    {d.portions}
                  </div>
                  <div className="text-[10px] text-app-text-muted">
                    {headers.portions.toLowerCase()}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[13px] text-app-text tabular-nums">
                    {formatValue(d.revenue)}
                  </div>
                  <div className="text-[10px] text-app-text-muted">{rangeBadge}</div>
                </div>
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] px-1.5 py-[3px] rounded border bg-accent-muted text-accent border-[rgba(194,245,66,0.25)]">
                    {d.categoryLabel}
                  </span>
                </div>
                <div>
                  <span
                    className={cn(
                      'font-mono text-[10px] uppercase tracking-[0.08em] inline-flex items-center gap-1 px-1.5 py-[3px] rounded',
                      d.available
                        ? 'bg-accent-muted text-accent'
                        : 'bg-status-error-bg text-status-error',
                    )}
                  >
                    <span className="w-1 h-1 rounded-full bg-current" />
                    {d.available ? availableLabel : unavailableLabel}
                  </span>
                </div>
                <div>
                  <svg className="block" width="72" height="22" viewBox="0 0 72 22" aria-hidden>
                    <polyline
                      fill="none"
                      stroke="var(--app-accent)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={sparkPoints(d.trend)}
                    />
                  </svg>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
