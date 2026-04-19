'use client';

import { Banknote, ShoppingBag, Store, Siren } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommandCenterGlobals } from '@/types/command-center.types';

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

interface StatProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  delta?: { pct: number; direction: 'up' | 'down' | 'flat' };
  alert?: boolean;
}

function Stat({ icon: Icon, label, value, sub, delta, alert }: StatProps) {
  return (
    <div className="flex flex-1 items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          alert ? 'bg-red-500/10 text-red-400' : 'bg-app-elevated text-app-text-secondary',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-app-text-muted">
            {label}
          </p>
          {delta && delta.direction !== 'flat' && (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums',
                delta.direction === 'up'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400',
              )}
            >
              {delta.direction === 'up' ? '+' : '-'}
              {delta.pct}%
            </span>
          )}
        </div>
        <p
          className={cn(
            'mt-0.5 text-xl font-black tracking-tight tabular-nums leading-tight text-app-text sm:text-2xl',
            alert && 'text-red-400',
          )}
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 truncate text-[10px] text-app-text-muted">{sub}</p>}
      </div>
    </div>
  );
}

interface CommandCenterHeroProps {
  globals: CommandCenterGlobals;
}

export function CommandCenterHero({ globals }: CommandCenterHeroProps) {
  const revenueDelta = computeDelta(globals.revenue_today, globals.revenue_yesterday);
  const ordersDelta = computeDelta(globals.orders_today, globals.orders_yesterday);

  return (
    <div className="flex shrink-0 divide-x divide-app-border border-b border-app-border">
      <Stat
        icon={Banknote}
        label="CA aujourd'hui"
        value={formatCFA(globals.revenue_today)}
        sub={`Hier ${formatCFA(globals.revenue_yesterday)}`}
        delta={revenueDelta}
      />
      <Stat
        icon={ShoppingBag}
        label="Commandes"
        value={String(globals.orders_today)}
        sub={`Hier ${globals.orders_yesterday}`}
        delta={ordersDelta}
      />
      <Stat
        icon={Store}
        label="Sites actifs"
        value={`${globals.active_locations}/${globals.total_locations}`}
        sub={
          globals.total_locations > 0
            ? `${Math.round((globals.active_locations / globals.total_locations) * 100)}% en ligne`
            : 'Aucun site'
        }
      />
      <Stat
        icon={Siren}
        label="Alertes"
        value={String(globals.alerts_count)}
        sub={globals.alerts_count > 0 ? 'A traiter' : 'Tout est ok'}
        alert={globals.alerts_count > 0}
      />
    </div>
  );
}
