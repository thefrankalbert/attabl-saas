'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UtensilsCrossed, ChevronsUpDown, Plus, Check } from 'lucide-react';
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
import type { TenantSwitchOption } from '@/types/tenant-switch.types';

interface ShellBrandSwitcherProps {
  tenantName: string;
  tenantSlug: string;
  userTenants: TenantSwitchOption[];
  collapsed: boolean;
}

export function ShellBrandSwitcher({
  tenantName,
  tenantSlug,
  userTenants,
  collapsed,
}: ShellBrandSwitcherProps) {
  const router = useRouter();
  const t = useTranslations('sidebar');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          title={collapsed ? 'ATTABL' : undefined}
          className={cn(
            'flex h-12 w-full items-center gap-2 rounded-[0.625rem] text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]',
            collapsed ? 'justify-center px-0' : 'justify-start px-2',
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-[0.625rem] bg-[var(--primary)] text-[var(--primary-foreground)]">
            <UtensilsCrossed className="size-4" />
          </span>
          {!collapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                <span className="truncate text-[13px] font-semibold">ATTABL</span>
                <span className="truncate text-xs text-[var(--muted-foreground)]">
                  {tenantName}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-56">
        <DropdownMenuLabel className="text-[var(--muted-foreground)]">
          {t('switchSpace')}
        </DropdownMenuLabel>
        {userTenants.length > 0 ? (
          userTenants.map((opt) => {
            const isCurrent = opt.slug === tenantSlug;
            return (
              <DropdownMenuItem
                key={opt.id}
                onClick={() => {
                  if (!isCurrent) router.push(`/sites/${opt.slug}/admin`);
                }}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[var(--secondary)] text-[10px] font-bold text-[var(--secondary-foreground)]">
                  {opt.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 truncate">{opt.name}</span>
                {isCurrent && <Check className="size-4 shrink-0" />}
              </DropdownMenuItem>
            );
          })
        ) : (
          <DropdownMenuItem disabled>{tenantName}</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-[44px]" onClick={() => router.push('/admin/tenants')}>
          <Plus className="size-4 shrink-0" />
          <span className="flex-1 truncate">{t('addRestaurant')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
