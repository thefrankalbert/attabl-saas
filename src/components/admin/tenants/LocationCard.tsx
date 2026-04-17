'use client';

import Image from 'next/image';
import { ArrowRight, Building2, Crown, ExternalLink, TriangleAlert } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LocationStat } from '@/types/command-center.types';

function formatCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount) + ' F';
}

function computeDelta(
  current: number,
  previous: number,
): { pct: number; direction: 'up' | 'down' | 'flat' } {
  if (previous === 0 && current === 0) return { pct: 0, direction: 'flat' };
  if (previous === 0) return { pct: 100, direction: 'up' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    pct: Math.abs(pct),
    direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
  };
}

interface LocationRowProps {
  location: LocationStat;
  rank?: 'top' | 'warn' | null;
  onOpenDashboard: (slug: string) => void;
  onOpenMenu: (slug: string) => void;
}

export function LocationRow({
  location,
  rank,
  onOpenDashboard,
  onOpenMenu,
}: LocationRowProps) {
  const revenueDelta = computeDelta(location.revenue_today, location.revenue_yesterday);
  const sparkData = location.sparkline.map((v, i) => ({ i, v }));
  const showSpark = sparkData.some((d) => d.v > 0);

  return (
    <div className="group flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-app-hover/40">
      <div className="shrink-0">
        {location.tenant_logo_url ? (
          <Image
            src={location.tenant_logo_url}
            alt={location.tenant_name}
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-app-elevated">
            <Building2 className="h-3.5 w-3.5 text-app-text-muted" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold text-app-text">{location.tenant_name}</h3>
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
              location.is_active ? 'bg-emerald-400' : 'bg-app-text-muted',
            )}
            aria-label={location.is_active ? 'En ligne' : 'Hors ligne'}
          />
          {rank === 'top' && (
            <span className="flex items-center gap-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent ring-1 ring-accent/30">
              <Crown className="h-2.5 w-2.5" />
              Top
            </span>
          )}
          {rank === 'warn' && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/30">
              <TriangleAlert className="h-2.5 w-2.5" />
              Warn
            </span>
          )}
          {location.tenant_plan && (
            <Badge
              variant="outline"
              className="rounded-md border-app-border px-1 py-0 text-[9px] font-semibold uppercase"
            >
              {location.tenant_plan}
            </Badge>
          )}
        </div>
        <p className="truncate text-[11px] text-app-text-muted">
          {location.tenant_slug}.attabl.com
        </p>
      </div>

      {showSpark && (
        <div className="hidden h-8 w-16 shrink-0 sm:block">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${location.tenant_id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--app-text-secondary)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--app-text-secondary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="var(--app-text-secondary)"
                strokeWidth={1.5}
                fill={`url(#spark-${location.tenant_id})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="shrink-0 text-right">
        <p className="text-sm font-black tabular-nums leading-tight text-app-text">
          {formatCFA(location.revenue_today)}
        </p>
        <div className="mt-0.5 flex items-center justify-end gap-1.5">
          {revenueDelta.direction !== 'flat' && (
            <span
              className={cn(
                'text-[9px] font-bold tabular-nums',
                revenueDelta.direction === 'up' ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              {revenueDelta.direction === 'up' ? '+' : '-'}
              {revenueDelta.pct}%
            </span>
          )}
          <span className="text-[9px] text-app-text-muted">{location.orders_today} cmd</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenDashboard(location.tenant_slug)}
          className="h-8 gap-1 rounded-lg border-app-border px-2.5 text-xs"
        >
          Ouvrir
          <ArrowRight className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenMenu(location.tenant_slug)}
          className="h-8 rounded-lg px-2 text-app-text-muted hover:text-app-text"
          aria-label="Ouvrir le menu public"
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
