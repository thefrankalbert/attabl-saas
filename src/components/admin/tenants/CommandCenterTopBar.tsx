'use client';

import { LogOut, Shield, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

interface CommandCenterTopBarProps {
  mode: 'superadmin' | 'owner';
  userName: string;
  ordersLiveCount: number;
  onLogout: () => void;
}

export function CommandCenterTopBar({
  mode,
  userName,
  ordersLiveCount,
  onLogout,
}: CommandCenterTopBarProps) {
  const modeLabel = mode === 'superadmin' ? 'Super Admin' : 'Groupe';
  const ModeIcon = mode === 'superadmin' ? Shield : Building2;

  return (
    <header className="shrink-0 border-b border-app-border bg-app-bg/80 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-app-elevated ring-1 ring-app-border">
            <ModeIcon className="h-3.5 w-3.5 text-app-text" />
          </div>
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="text-sm font-bold tracking-tight text-app-text sm:text-base">ATTABL</h1>
            <span className="text-app-text-muted">/</span>
            <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-app-text-secondary">
              {modeLabel}
            </span>
            {userName && (
              <span className="hidden truncate text-[11px] text-app-text-muted md:inline">
                {userName}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-app-border bg-app-elevated px-3 py-1.5 sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[11px] font-semibold text-app-text-secondary">
              {ordersLiveCount > 0 ? `${ordersLiveCount} commandes aujourd'hui` : 'En veille'}
            </span>
          </div>
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="gap-2 rounded-xl border-app-border"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden text-xs sm:inline">Deconnexion</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
