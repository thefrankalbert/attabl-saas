'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LocationStat } from '@/types/command-center.types';

interface TenantsListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: LocationStat[];
  onOpenDashboard: (slug: string) => void;
  onOpenMenu?: (slug: string) => void;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatFull(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}

const GRADIENTS = [
  'linear-gradient(135deg,#2563EB,#1E40AF)',
  'linear-gradient(135deg,#B45309,#78350F)',
  'linear-gradient(135deg,#059669,#065F46)',
  'linear-gradient(135deg,#DC2626,#7F1D1D)',
  'linear-gradient(135deg,#7C3AED,#4C1D95)',
  'linear-gradient(135deg,#0D9488,#134E4A)',
];

export function TenantsListDialog({
  open,
  onOpenChange,
  locations,
  onOpenDashboard,
  onOpenMenu,
}: TenantsListDialogProps) {
  const t = useTranslations('admin.tenants.commandCenter.tenantsDialog');
  const tEst = useTranslations('admin.tenants.commandCenter.establishments');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter(
      (loc) =>
        loc.tenant_name.toLowerCase().includes(q) || loc.tenant_slug.toLowerCase().includes(q),
    );
  }, [locations, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl cc-shell" style={{ color: 'var(--cc-text)' }}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {locations.length > 1
              ? t('subtitlePlural', { count: nf.format(locations.length) })
              : t('subtitleSingle', { count: nf.format(locations.length) })}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2"
            style={{ color: 'var(--cc-text-3)' }}
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="-mx-1 max-h-[60vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs" style={{ color: 'var(--cc-text-3)' }}>
              {t('noResults', { query })}
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filtered.map((loc, idx) => {
                const degraded = !loc.is_active;
                return (
                  <li key={loc.tenant_id} className="group relative">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        onOpenDashboard(loc.tenant_slug);
                        onOpenChange(false);
                      }}
                      aria-label={tEst('openDashboard', { name: loc.tenant_name })}
                      className={cn(
                        'grid h-auto w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md px-2 py-2 text-left font-normal shadow-none transition-colors',
                        'justify-start hover:bg-[var(--cc-surface-2)]',
                      )}
                      style={{ color: 'var(--cc-text)' }}
                    >
                      <div
                        className="cc-mono grid size-9 shrink-0 place-items-center rounded-lg text-xs font-semibold text-white"
                        style={{
                          background: GRADIENTS[idx % GRADIENTS.length],
                          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
                        }}
                        aria-hidden
                      >
                        {initialsFor(loc.tenant_name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 whitespace-nowrap text-[13.5px] font-medium">
                          <span
                            aria-hidden
                            className="size-1.5 shrink-0 rounded-full"
                            style={{
                              background: degraded ? 'var(--cc-warn)' : 'var(--cc-accent-ink)',
                            }}
                          />
                          <span className="truncate">{loc.tenant_name}</span>
                        </div>
                        <div
                          className="cc-mono mt-0.5 truncate text-[11.5px]"
                          style={{ color: 'var(--cc-text-3)' }}
                        >
                          {loc.tenant_slug}.attabl.com
                        </div>
                      </div>
                      <div
                        className="cc-mono whitespace-nowrap text-[13px]"
                        style={{ color: 'var(--cc-text)' }}
                      >
                        {formatFull(loc.revenue_today, locale)} F
                        <span
                          className="mt-0.5 block text-[11px] font-normal"
                          style={{ color: 'var(--cc-text-3)' }}
                        >
                          {nf.format(loc.orders_today)} {tEst('ordersShort')}
                        </span>
                      </div>
                    </Button>
                    {onOpenMenu && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          onOpenMenu(loc.tenant_slug);
                          onOpenChange(false);
                        }}
                        aria-label={tEst('openMenu', { name: loc.tenant_name })}
                        className="absolute right-3 top-1/2 z-10 h-6 -translate-y-1/2 rounded-md px-2 text-[11px] opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                        style={{ color: 'var(--cc-text-3)' }}
                      >
                        {t('menu')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
