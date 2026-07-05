'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CreditCard, Settings, ChevronsUpDown, CircleUser, LifeBuoy, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SettingsTab } from './SettingsDialog';

interface ShellAccountMenuProps {
  basePath: string;
  tenantSlug: string;
  userName?: string;
  userEmail?: string;
  initials: string;
  planName: string;
  planRaw: string;
  collapsed: boolean;
  /** Opens the settings hub dialog on the given tab (Parametres + account menu) */
  onOpenSettings?: (tab: SettingsTab) => void;
}

export function ShellAccountMenu({
  basePath,
  tenantSlug,
  userName,
  userEmail,
  initials,
  planName,
  planRaw,
  collapsed,
  onOpenSettings,
}: ShellAccountMenuProps) {
  const t = useTranslations('sidebar');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          title={collapsed ? userName || t('accountMenu') : undefined}
          className={cn(
            'flex h-12 w-full items-center gap-2 rounded-[0.625rem] text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]',
            collapsed ? 'justify-center px-0' : 'justify-start px-2',
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[0.625rem] bg-[var(--secondary)] text-xs font-semibold text-[var(--secondary-foreground)]">
            {initials}
          </span>
          {!collapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                <span className="truncate text-[13px] font-semibold">
                  {userName || t('accountMenu')}
                </span>
                <span className="truncate text-xs text-[var(--muted-foreground)]">
                  {t('planLabel', { plan: planName })}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? 'right' : 'top'}
        align={collapsed ? 'end' : 'start'}
        className="w-56"
      >
        <DropdownMenuLabel>
          <span className="flex flex-col">
            <span className="truncate text-[13px] font-semibold">
              {userName || t('accountMenu')}
            </span>
            <span className="truncate text-xs font-normal text-[var(--muted-foreground)]">
              {userEmail || `${tenantSlug}.attabl.com`}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onOpenSettings ? (
          <>
            <DropdownMenuItem onClick={() => onOpenSettings('compte')}>
              <CircleUser className="size-4" />
              {t('accountMenu')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenSettings('etablissement')}>
              <Settings className="size-4" />
              {t('navSettings')}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link href={`${basePath}/settings`} prefetch={false}>
                <CircleUser className="size-4" />
                {t('accountMenu')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`${basePath}/settings`} prefetch={false}>
                <Settings className="size-4" />
                {t('navSettings')}
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href={`${basePath}/subscription`} prefetch={false}>
            <CreditCard className="size-4" />
            <span className="flex-1">{t('navSubscription')}</span>
            <span className="rounded bg-[var(--secondary)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--secondary-foreground)]">
              {planRaw}
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`${basePath}/support`} prefetch={false}>
            <LifeBuoy className="size-4" />
            {t('navSupport')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action="/api/auth/signout" method="post">
          <DropdownMenuItem asChild className="text-[var(--destructive)]">
            <Button
              type="submit"
              variant="ghost"
              className="h-auto w-full justify-start gap-2 px-2.5 py-2 font-normal text-[var(--destructive)] hover:bg-[var(--accent)] hover:text-[var(--destructive)]"
            >
              <LogOut className="size-4" />
              {t('logout')}
            </Button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
