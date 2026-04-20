'use client';

import { ArrowRight, ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LocationStat } from '@/types/command-center.types';

interface EstablishmentsListProps {
  locations: LocationStat[];
  onOpenDashboard: (slug: string) => void;
  /** Optional handler to open the public menu of the tenant (owner mode keeps the deep link). */
  onOpenMenu?: (slug: string) => void;
  /** Optional handler for owner mode - shows a "+" button next to the section link. */
  onAdd?: () => void;
  /**
   * Open the full searchable list dialog. Shown when there are more tenants
   * than `max` or when the user wants to search. Matches the mockup's
   * "Tout voir" link.
   */
  onSeeAll?: () => void;
  /** Cap on the number of rows shown (defaults to 4 per mockup). */
  max?: number;
}

const GRADIENTS = [
  'linear-gradient(135deg,#2563EB,#1E40AF)',
  'linear-gradient(135deg,#B45309,#78350F)',
  'linear-gradient(135deg,#059669,#065F46)',
  'linear-gradient(135deg,#DC2626,#7F1D1D)',
  'linear-gradient(135deg,#7C3AED,#4C1D95)',
  'linear-gradient(135deg,#0D9488,#134E4A)',
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatFull(value: number): string {
  return Math.round(value).toLocaleString('fr-FR');
}

export function EstablishmentsList({
  locations,
  onOpenDashboard,
  onOpenMenu,
  onAdd,
  onSeeAll,
  max = 4,
}: EstablishmentsListProps) {
  const visible = locations.slice(0, max);
  const count = locations.length;
  const hasMore = count > max;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <div
          className="flex items-center gap-2 text-[12px] font-medium tracking-[0.02em]"
          style={{ color: 'var(--cc-text-2)' }}
        >
          Etablissements
          <span className="cc-mono text-[11px]" style={{ color: 'var(--cc-text-3)' }}>
            {count}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onAdd && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onAdd}
              className="h-6 w-6 rounded-md"
              style={{ color: 'var(--cc-text-3)' }}
              aria-label="Ajouter un etablissement"
            >
              <Plus className="size-3.5" strokeWidth={1.8} />
            </Button>
          )}
          {onSeeAll && hasMore && (
            <Button
              type="button"
              variant="ghost"
              onClick={onSeeAll}
              className="h-auto gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-normal shadow-none"
              style={{ color: 'var(--cc-text-3)' }}
            >
              Tout voir
              <ArrowRight className="size-3" strokeWidth={2} aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {visible.length === 0 ? (
          <div className="py-6 text-center text-[12px]" style={{ color: 'var(--cc-text-3)' }}>
            Aucun etablissement
          </div>
        ) : (
          visible.map((loc, idx) => (
            <EstablishmentRow
              key={loc.tenant_id}
              location={loc}
              gradient={GRADIENTS[idx % GRADIENTS.length]}
              onClick={() => onOpenDashboard(loc.tenant_slug)}
              onOpenMenu={onOpenMenu ? () => onOpenMenu(loc.tenant_slug) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface EstablishmentRowProps {
  location: LocationStat;
  gradient: string;
  onClick: () => void;
  onOpenMenu?: () => void;
}

function EstablishmentRow({ location, gradient, onClick, onOpenMenu }: EstablishmentRowProps) {
  const initials = initialsFor(location.tenant_name);
  const url = `${location.tenant_slug}.attabl.com`;
  const degraded = !location.is_active;

  // Structure: an outer `<div>` positions the row. A full-area invisible
  // Button captures the main click (open dashboard). The optional "open menu"
  // Button is a SIBLING overlay (not nested) with its own event target and
  // higher z-index, so both buttons can coexist without the invalid
  // `<button>` inside `<button>` HTML pattern.
  return (
    <div className="group relative">
      <Button
        type="button"
        variant="ghost"
        onClick={onClick}
        aria-label={`Ouvrir le dashboard de ${location.tenant_name}`}
        className={cn(
          '-mx-2.5 grid h-auto w-[calc(100%+1.25rem)] grid-cols-[auto_1fr_auto_auto] items-center gap-3.5 rounded-lg p-2.5 text-left font-normal shadow-none transition-colors',
          'justify-start hover:bg-[var(--cc-surface-2)]',
        )}
        style={{ color: 'var(--cc-text)' }}
      >
        <div
          className="cc-mono grid size-[34px] shrink-0 place-items-center rounded-lg text-[12px] font-semibold text-white"
          style={{
            background: gradient,
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
          }}
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 whitespace-nowrap text-[13.5px] font-medium">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: degraded ? 'var(--cc-warn)' : 'var(--cc-accent-ink)' }}
            />
            <span className="truncate">{location.tenant_name}</span>
          </div>
          <div
            className="cc-mono mt-0.5 truncate text-[11.5px]"
            style={{ color: 'var(--cc-text-3)' }}
          >
            {url}
          </div>
        </div>
        <div className="cc-mono whitespace-nowrap text-[13px]" style={{ color: 'var(--cc-text)' }}>
          {formatFull(location.revenue_today)} F
          <span
            className="mt-0.5 block text-[11px] font-normal"
            style={{ color: 'var(--cc-text-3)' }}
          >
            {location.orders_today} cmd.
          </span>
        </div>
        <ArrowRight
          className="size-3.5 opacity-0 transition-[opacity,transform] duration-100 group-focus-within:opacity-100 group-hover:translate-x-0.5 group-hover:opacity-100"
          style={{ color: 'var(--cc-text-3)' }}
          strokeWidth={1.8}
          aria-hidden
        />
      </Button>

      {onOpenMenu && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onOpenMenu}
          className="absolute right-[18px] top-1/2 z-10 h-6 w-6 -translate-y-1/2 rounded-md opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          style={{ color: 'var(--cc-text-3)' }}
          aria-label={`Ouvrir le menu client de ${location.tenant_name}`}
        >
          <ExternalLink className="size-3" strokeWidth={1.8} />
        </Button>
      )}
    </div>
  );
}
