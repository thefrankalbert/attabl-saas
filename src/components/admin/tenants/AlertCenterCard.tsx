'use client';

import { ArrowRight, Clock, CreditCard, PackageX, Siren, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CommandCenterAlert } from '@/types/command-center.types';

const ALERT_META: Record<CommandCenterAlert['kind'], { icon: LucideIcon; color: string }> = {
  stock: { icon: PackageX, color: 'text-amber-400' },
  offline: { icon: WifiOff, color: 'text-red-400' },
  payment: { icon: CreditCard, color: 'text-red-400' },
  pending: { icon: Clock, color: 'text-blue-400' },
};

interface AlertCenterCardProps {
  alerts: CommandCenterAlert[];
  onSelectTenant: (slug: string) => void;
}

export function AlertCenterCard({ alerts, onSelectTenant }: AlertCenterCardProps) {
  return (
    <section className="flex shrink-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-app-border px-1 py-2">
        <div className="flex items-center gap-2">
          <Siren
            className={cn(
              'h-3.5 w-3.5',
              alerts.length > 0 ? 'text-red-400' : 'text-app-text-muted',
            )}
          />
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-app-text-muted">
            Alertes
          </h2>
          <span className="text-[11px] text-app-text-muted">{alerts.length}</span>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 px-1 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <p className="text-[11px] text-app-text-muted">
            Stock, paiements et connectivite au vert.
          </p>
        </div>
      ) : (
        <ul className="max-h-40 divide-y divide-app-border overflow-y-auto scrollbar-hide">
          {alerts.map((alert) => {
            const meta = ALERT_META[alert.kind];
            const Icon = meta.icon;
            return (
              <li key={alert.id}>
                <Button
                  variant="ghost"
                  onClick={() => onSelectTenant(alert.tenant_slug)}
                  className="group flex h-auto w-full items-center justify-start gap-2.5 rounded-none px-1 py-2 text-left hover:bg-app-hover/40"
                >
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.color)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-app-text">
                      {alert.label}
                    </p>
                    <p className="truncate text-[10px] text-app-text-muted">
                      {alert.tenant_name}
                    </p>
                  </div>
                  <ArrowRight className="h-3 w-3 text-app-text-muted group-hover:text-accent" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
