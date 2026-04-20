'use client';

import { useTranslations } from 'next-intl';
import { Moon, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TopbarMinimalProps {
  /** Breadcrumb label shown after the brand (e.g. "Admin BluTable", "Plateforme"). */
  crumb: string;
  /** Short initials for the avatar (max 2-3 chars). */
  userInitials: string;
  /** Full display name next to the avatar. */
  userName: string;
  onLogout?: () => void;
}

export function TopbarMinimal({ crumb, userInitials, userName, onLogout }: TopbarMinimalProps) {
  const t = useTranslations('admin.tenants.commandCenter.topbar');
  const handleThemeToggle = () => {
    window.dispatchEvent(new CustomEvent('cc:theme:toggle'));
  };

  return (
    <header
      className={cn('flex h-14 shrink-0 items-center gap-[14px] px-8')}
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

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleThemeToggle}
        className="h-7 w-7 shrink-0 rounded-md"
        style={{ color: 'var(--cc-text-2)' }}
        aria-label={t('toggleTheme')}
      >
        <Moon className="size-[14px]" strokeWidth={1.8} />
      </Button>

      <div
        className="inline-flex items-center gap-2.5 whitespace-nowrap text-[13px]"
        style={{ color: 'var(--cc-text-2)' }}
      >
        <div
          className="grid size-6 place-items-center rounded-full text-[10px] font-semibold"
          style={{
            background: 'linear-gradient(135deg, #c2f542, #6aa512)',
            color: '#0a0a0a',
            fontFamily: 'var(--cc-mono)',
          }}
        >
          {userInitials}
        </div>
        <span>{userName}</span>
      </div>

      {onLogout && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onLogout}
          className="h-7 w-7 shrink-0 rounded-md"
          style={{ color: 'var(--cc-text-3)' }}
          aria-label={t('logout')}
        >
          <LogOut className="size-[13px]" strokeWidth={1.8} />
        </Button>
      )}
    </header>
  );
}
