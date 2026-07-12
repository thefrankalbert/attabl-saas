'use client';

import { useTranslations } from 'next-intl';
import { Moon, Sun, LogOut, RefreshCw, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUpdateAvailable } from '@/hooks/useUpdateAvailable';

interface TopbarMinimalProps {
  /** Breadcrumb label shown after the brand (e.g. "Admin BluTable", "Plateforme"). */
  crumb: string;
  /** Short initials for the avatar (max 2-3 chars). */
  userInitials: string;
  /** Full display name next to the avatar. */
  userName: string;
  /** Current shell theme, used to pick the toggle icon (Sun in dark, Moon in light). */
  theme?: 'light' | 'dark';
  onLogout?: () => void;
  /** Triggered by the inline refresh control. */
  onRefresh?: () => void;
  /** When true, the refresh control spins and is disabled. */
  isRefreshing?: boolean;
  /** Deploy sha this bundle was built from; drives the update-available control. */
  appVersion?: string;
}

export function TopbarMinimal({
  crumb,
  userInitials,
  userName,
  theme = 'light',
  onLogout,
  onRefresh,
  isRefreshing = false,
  appVersion,
}: TopbarMinimalProps) {
  const t = useTranslations('admin.tenants.commandCenter.topbar');
  const tUpdate = useTranslations('updateBanner');
  const updateAvailable = useUpdateAvailable(appVersion);
  const handleThemeToggle = () => {
    window.dispatchEvent(new CustomEvent('cc:theme:toggle'));
  };

  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center gap-[14px] border-b border-[var(--cc-border)] px-8',
      )}
      style={{ color: 'var(--cc-text)' }}
    >
      <div className="flex items-center gap-2.5 whitespace-nowrap text-sm font-medium tracking-tight">
        <div
          className="grid size-[22px] place-items-center rounded-md text-[11px] font-semibold"
          style={{
            background: 'var(--cc-text)',
            color: 'var(--cc-bg)',
            fontFamily: 'var(--cc-mono)',
          }}
        >
          A
        </div>
        <span>Attabl</span>
      </div>

      <div
        className="flex items-center gap-2.5 whitespace-nowrap text-[13px]"
        style={{ color: 'var(--cc-text-3)' }}
      >
        <span className="opacity-60">/</span>
        <span style={{ color: 'var(--cc-text-2)' }}>{crumb}</span>
      </div>

      <div className="flex-1" />

      {updateAvailable && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => window.location.reload()}
          className="relative shrink-0 rounded-md"
          style={{ color: 'var(--cc-accent)' }}
          title={tUpdate('message')}
          aria-label={tUpdate('message')}
        >
          <ArrowUpCircle className="size-[15px]" strokeWidth={2} />
          <span className="absolute right-1 top-1 flex size-2" aria-hidden="true">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ background: 'var(--cc-accent)' }}
            />
            <span
              className="relative inline-flex size-2 rounded-full"
              style={{ background: 'var(--cc-accent)' }}
            />
          </span>
        </Button>
      )}

      {onRefresh && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="shrink-0 rounded-md"
          style={{ color: 'var(--cc-text-2)' }}
          aria-label={t('refresh')}
        >
          <RefreshCw
            className={cn('size-[15px]', isRefreshing && 'animate-spin')}
            strokeWidth={2}
          />
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleThemeToggle}
        className="shrink-0 rounded-md"
        style={{ color: 'var(--cc-text-2)' }}
        aria-label={t('toggleTheme')}
      >
        {theme === 'dark' ? (
          <Sun className="size-[14px]" strokeWidth={2} />
        ) : (
          <Moon className="size-[14px]" strokeWidth={2} />
        )}
      </Button>

      <div
        className="inline-flex items-center gap-2.5 whitespace-nowrap text-[13px]"
        style={{ color: 'var(--cc-text-2)' }}
      >
        <div
          className="grid size-6 place-items-center rounded-full text-[10px] font-semibold"
          style={{
            background: 'linear-gradient(135deg, var(--cc-accent), var(--cc-accent-hover))',
            color: '#ffffff',
            fontFamily: 'var(--cc-mono)',
          }}
        >
          {userInitials}
        </div>
        <span className="flex flex-col leading-tight">
          <span
            className="text-[9px] font-medium uppercase tracking-[0.08em]"
            style={{ color: 'var(--cc-text-3)' }}
          >
            {t('account')}
          </span>
          <span>{userName}</span>
        </span>
      </div>

      {onLogout && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onLogout}
          className="shrink-0 rounded-md"
          style={{ color: 'var(--cc-text-3)' }}
          aria-label={t('logout')}
        >
          <LogOut className="size-[13px]" strokeWidth={2} />
        </Button>
      )}
    </header>
  );
}
