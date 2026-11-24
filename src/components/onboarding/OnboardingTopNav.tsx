'use client';

import { useState } from 'react';
import { Loader2, LayoutGrid, Check, CloudOff, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';

import type { PhaseDefinition } from './onboarding-steps';

interface OnboardingTopNavProps {
  phases: PhaseDefinition[];
  phase: number;
  tenantName: string;
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  t: (key: string) => string;
  phaseIsComplete: (p: number) => boolean;
  goToPhase: (targetPhase: number) => void;
}

export function OnboardingTopNav({
  phases,
  phase,
  tenantName,
  autoSaveStatus,
  t,
  phaseIsComplete,
  goToPhase,
}: OnboardingTopNavProps) {
  const tc = useTranslations('common');
  const [loggingOut, setLoggingOut] = useState(false);

  // Se deconnecter ou changer de compte sans finir le parcours: le brouillon
  // est deja enregistre cote serveur, la reprise se fera a la prochaine
  // connexion. Rechargement complet voulu pour vider l'etat du navigateur.
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => undefined);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- rechargement complet voulu a la deconnexion, comme ShellAccountMenu (2026-11-24)
    window.location.assign('/login');
  };

  return (
    /* --- Floating top navigation strip --- */
    <header className="shrink-0 h-14 bg-app-card border-b border-app-border flex items-center px-4 sm:px-6 z-10">
      {/* Left: logo link + tenant name */}
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href="/"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-app-hover transition-colors shrink-0"
          title={tc('home')}
        >
          <LayoutGrid className="w-4 h-4 text-app-text-muted" />
        </Link>
        <span className="hidden max-w-[180px] truncate text-sm font-semibold text-app-text sm:inline">
          {tenantName || 'ATTABL'}
        </span>
      </div>

      {/* Center: 3 phase tabs */}
      <div className="flex-1 flex justify-center gap-1">
        {phases.map((phaseDef, idx) => {
          const phaseNum = idx + 1;
          const isActive = phase === phaseNum;
          const isCompleted = phase > phaseNum;
          const isFuture = phase < phaseNum;
          const Icon = phaseDef.icon;

          return (
            <Button
              key={phaseNum}
              type="button"
              variant="ghost"
              onClick={() => {
                if (isCompleted && phaseIsComplete(phaseNum)) goToPhase(phaseNum);
              }}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors h-auto ${
                isActive
                  ? 'text-accent'
                  : isCompleted
                    ? 'text-app-text-secondary hover:bg-app-hover cursor-pointer'
                    : 'text-app-text-muted opacity-40 cursor-default'
              }`}
              disabled={isFuture}
            >
              {isCompleted ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{t(phaseDef.labelKey)}</span>

              {/* Bottom accent line for active tab - single clean line */}
              {isActive && (
                <span className="absolute -bottom-px left-3 right-3 h-0.5 rounded-full bg-accent" />
              )}
            </Button>
          );
        })}
      </div>

      {/* Right: auto-save status + theme toggle */}
      <div className="flex items-center gap-2 shrink-0">
        {autoSaveStatus === 'saving' && (
          <span className="text-xs text-app-text-muted flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="hidden sm:inline">{t('autoSaving')}</span>
          </span>
        )}
        {autoSaveStatus === 'saved' && (
          <span className="text-xs text-accent flex items-center gap-1">
            <Check className="w-3 h-3" />
            <span className="hidden sm:inline">{t('autoSaved')}</span>
          </span>
        )}
        {autoSaveStatus === 'error' && (
          <span className="text-xs text-status-error flex items-center gap-1" role="status">
            <CloudOff className="w-3 h-3" />
            <span className="hidden sm:inline">{t('autoSaveFailed')}</span>
          </span>
        )}
        <ThemeToggle />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-label={tc('logout')}
          title={tc('logout')}
          className="text-app-text-muted hover:text-app-text"
        >
          {loggingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
        </Button>
      </div>
    </header>
  );
}
