'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RecentOrder } from '@/types/command-center.types';
import { mapFluxStatus, type FluxStatus } from './flux-status';
import { getCurrencySymbol } from '@/lib/utils/currency';

interface FluxListProps {
  orders: RecentOrder[];
  onSelect?: (tenantSlug: string) => void;
  /** Max rows shown. Defaults to 5 per mockup. */
  max?: number;
  /**
   * When false, the tenant name is hidden from each flux row (owner mode with
   * a single establishment). When true (default), tenant names are shown so
   * superadmins and multi-site owners can tell sites apart.
   */
  multiTenant?: boolean;
}

function formatAmount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function FluxList({ orders, onSelect, max = 5, multiTenant = true }: FluxListProps) {
  const t = useTranslations('admin.tenants.commandCenter.flux');
  const locale = useLocale();
  const visible = orders.slice(0, max);
  const labels: Record<FluxStatus, string> = {
    pending: t('statusPending'),
    confirmed: t('statusConfirmed'),
    prep: t('statusPreparing'),
    ready: t('statusReady'),
    delivered: t('statusDelivered'),
    cancelled: t('statusCancelled'),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-[12px] border border-[var(--cc-border)] bg-[var(--cc-surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div
          className="flex items-center gap-2 text-xs font-medium tracking-[0.02em]"
          style={{ color: 'var(--cc-text-2)' }}
        >
          {t('title')}
          <span className="cc-live-dot">{t('live')}</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {visible.length === 0 ? (
          <div className="py-6 text-center text-xs" style={{ color: 'var(--cc-text-3)' }}>
            {t('empty')}
          </div>
        ) : (
          visible.map((order, idx) => (
            <FluxRow
              key={order.id}
              order={order}
              isFirst={idx === 0}
              showTenant={multiTenant}
              onClick={onSelect ? () => onSelect(order.tenant_slug) : undefined}
              statusLabel={labels[mapFluxStatus(order.status)]}
              locale={locale}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface FluxRowProps {
  order: RecentOrder;
  isFirst: boolean;
  showTenant: boolean;
  onClick?: () => void;
  statusLabel: string;
  locale: string;
}

function FluxRow({ order, isFirst, showTenant, onClick, statusLabel, locale }: FluxRowProps) {
  const status = mapFluxStatus(order.status);
  const statusBg: Record<FluxStatus, string> = {
    pending: 'var(--cc-text-3)',
    confirmed: 'var(--cc-text-3)',
    prep: 'var(--cc-warn)',
    ready: 'var(--cc-accent-ink)',
    delivered: 'var(--cc-accent-ink)',
    cancelled: 'var(--cc-danger)',
  };
  const badgeStyle: Record<FluxStatus, { background: string; color: string }> = {
    delivered: { background: 'var(--cc-accent-soft)', color: 'var(--cc-accent-ink)' },
    ready: { background: 'var(--cc-accent-soft)', color: 'var(--cc-accent-ink)' },
    prep: {
      background: 'color-mix(in srgb, var(--cc-warn) 16%, transparent)',
      color: 'var(--cc-warn)',
    },
    pending: { background: 'var(--cc-surface-2)', color: 'var(--cc-text-2)' },
    confirmed: { background: 'var(--cc-surface-2)', color: 'var(--cc-text-2)' },
    cancelled: { background: 'var(--cc-surface-2)', color: 'var(--cc-text-2)' },
  };
  const interactive = Boolean(onClick);

  const content = (
    <>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: statusBg[status] }}
      />
      <div className="min-w-0">
        <div
          className="cc-mono truncate whitespace-nowrap text-xs"
          style={{ color: 'var(--cc-text)' }}
        >
          #{order.order_number || order.id.slice(0, 8)}
        </div>
        <div
          className="mt-[3px] flex items-center gap-2 whitespace-nowrap text-xs"
          style={{ color: 'var(--cc-text-3)' }}
        >
          <span
            className="inline-flex items-center rounded px-1.5 py-[1px] text-xs font-bold uppercase tracking-[0.04em]"
            style={badgeStyle[status]}
          >
            {statusLabel}
          </span>
          <span className="cc-mono">{formatTime(order.created_at)}</span>
          {showTenant && order.tenant_name && (
            <>
              <span aria-hidden className="inline-block h-3 w-px bg-[var(--cc-border)]" />
              <span className="truncate">{order.tenant_name}</span>
            </>
          )}
        </div>
      </div>
      <div className="cc-mono whitespace-nowrap text-[12.5px]" style={{ color: 'var(--cc-text)' }}>
        {formatAmount(order.total, locale)} {getCurrencySymbol(order.currency)}
      </div>
    </>
  );

  const baseClass = cn(
    'grid min-h-[44px] grid-cols-[auto_1fr_auto] items-center gap-3 py-3',
    !isFirst && 'border-t',
  );
  const baseStyle = { borderColor: 'var(--cc-border)' } as const;

  if (interactive) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={onClick}
        className={cn(
          baseClass,
          'h-auto rounded-none px-0 font-normal shadow-none transition-colors',
          'justify-start text-left',
        )}
        style={baseStyle}
      >
        {content}
      </Button>
    );
  }

  return (
    <div className={baseClass} style={baseStyle}>
      {content}
    </div>
  );
}
