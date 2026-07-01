'use client';

import { ArrowRight, ExternalLink, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { TrendDelta } from '@/components/admin/tenants/v2/TrendDelta';
import type { LocationStat } from '@/types/command-center.types';

export interface EstablishmentCardLabels {
  manage: string;
  viewMenu: string;
  qr: string;
  online: string;
  offline: string;
  revenueToday: string;
  ordersToday: string;
  trend: string;
  trendNew: string;
  noSales: string;
}

interface EstablishmentCardProps {
  location: LocationStat;
  locale: string;
  labels: EstablishmentCardLabels;
  /** Optional formatted plan label (e.g. "Pro") shown as a badge. */
  planLabel?: string;
  onManage: () => void;
  onViewMenu?: () => void;
  onQr?: () => void;
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

/**
 * Rich, touch-first card for a single establishment - the primary object of the
 * "Mes etablissements" page. Layout: the avatar sits in a left gutter and ALL
 * text + the action button share ONE left edge (the column), so nothing jags.
 * The "Gerer" button is always visible (never hover-only) and pinned to the
 * card bottom (mt-auto) so buttons align across cards. Colors are cc-shell
 * tokens (light + dark); green is only an online-status cue.
 */
export function EstablishmentCard({
  location,
  locale,
  labels,
  planLabel,
  onManage,
  onViewMenu,
  onQr,
}: EstablishmentCardProps) {
  const initials = initialsFor(location.tenant_name);
  const url = `${location.tenant_slug}.attabl.com`;
  const online = location.is_active;
  const noSales = location.revenue_today === 0 && location.orders_today === 0;

  return (
    <Card className="flex h-full flex-col rounded-xl border-[var(--cc-border-strong)] bg-[var(--cc-surface)] p-4 text-[var(--cc-text)] shadow-none">
      <div className="flex flex-1 gap-3">
        <Avatar className="size-10 shrink-0 rounded-[10px]">
          {location.tenant_logo_url ? <AvatarImage src={location.tenant_logo_url} alt="" /> : null}
          <AvatarFallback className="rounded-[10px] bg-[var(--cc-surface-2)] text-[12px] font-semibold text-[var(--cc-text)]">
            {initials}
          </AvatarFallback>
        </Avatar>

        {/* Single aligned column: name, status, figures and button share one left edge */}
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-[15px] font-semibold leading-tight text-[var(--cc-text)]">
                {location.tenant_name}
              </h3>
              {planLabel ? (
                <span
                  className="shrink-0 rounded px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--cc-text-3)]"
                  style={{ background: 'var(--cc-surface-2)' }}
                >
                  {planLabel}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: online ? 'var(--cc-accent-ink)' : 'var(--cc-soft)' }}
              />
              <span
                className="shrink-0 text-[11px] font-medium"
                style={{ color: online ? 'var(--cc-accent-ink)' : 'var(--cc-text-3)' }}
              >
                {online ? labels.online : labels.offline}
              </span>
              <span aria-hidden className="shrink-0 text-[var(--cc-text-3)]">
                &middot;
              </span>
              {onViewMenu ? (
                <a
                  href={`https://${url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    onViewMenu();
                  }}
                  className="inline-flex min-w-0 items-center gap-1 font-mono text-[11px] text-[var(--cc-text-3)] transition-colors hover:text-[var(--cc-text)]"
                >
                  <span className="truncate">{url}</span>
                  <ExternalLink className="size-3 shrink-0" strokeWidth={2} aria-hidden />
                </a>
              ) : (
                <span className="truncate font-mono text-[11px] text-[var(--cc-text-3)]">
                  {url}
                </span>
              )}
            </div>
          </div>

          {/* Today's figures - or a soft nudge when there are no sales yet */}
          {noSales ? (
            <div className="text-[12px] text-[var(--cc-text-3)]">{labels.noSales}</div>
          ) : (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.07em] text-[var(--cc-text-3)]">
                {labels.revenueToday}
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[var(--cc-text)]">
                <span className="cc-mono text-[22px] font-semibold leading-none tabular-nums">
                  {formatFull(location.revenue_today, locale)}
                </span>
                <span className="text-[12px] text-[var(--cc-text-3)]">F</span>
                <TrendDelta
                  current={location.revenue_today}
                  previous={location.revenue_yesterday}
                  label={labels.trend}
                  newLabel={labels.trendNew}
                />
                <span className="ml-1 text-[11px] text-[var(--cc-text-3)]">
                  {new Intl.NumberFormat(locale).format(location.orders_today)} {labels.ordersToday}
                </span>
              </div>
            </div>
          )}

          {/* Actions - always visible, pinned to the card bottom for cross-card alignment */}
          <div className="mt-auto flex items-center gap-2">
            <Button
              type="button"
              onClick={onManage}
              className="h-10 flex-1 gap-2 rounded-lg bg-[var(--cc-accent)] text-[13px] font-semibold text-[var(--cc-on-accent)] shadow-none hover:bg-[var(--cc-accent-hover)]"
            >
              {labels.manage}
              <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
            </Button>
            {onQr ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onQr}
                aria-label={labels.qr}
                className={cn(
                  'size-10 rounded-lg border-[var(--cc-border)] bg-transparent text-[var(--cc-text-2)]',
                  'hover:bg-[var(--cc-surface-2)] hover:text-[var(--cc-text)]',
                )}
              >
                <QrCode className="size-4" strokeWidth={2} />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
