'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RecentOrder } from '@/types/command-center.types';

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

type FluxStatus = 'delivered' | 'prep' | 'attente';

function mapStatus(raw: string): FluxStatus {
  const s = raw.toLowerCase();
  if (s === 'delivered' || s === 'served' || s === 'ready') return 'delivered';
  if (s === 'preparing' || s === 'in_progress' || s === 'accepted') return 'prep';
  return 'attente';
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
    delivered: t('statusDelivered'),
    prep: t('statusPreparing'),
    attente: t('statusPending'),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-baseline justify-between">
        <div
          className="flex items-center gap-2 text-[12px] font-medium tracking-[0.02em]"
          style={{ color: 'var(--cc-text-2)' }}
        >
          {t('title')}
          <span className="cc-live-dot">{t('live')}</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {visible.length === 0 ? (
          <div className="py-6 text-center text-[12px]" style={{ color: 'var(--cc-text-3)' }}>
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
              statusLabel={labels[mapStatus(order.status)]}
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
  const status = mapStatus(order.status);
  const statusBg: Record<FluxStatus, string> = {
    delivered: 'var(--cc-accent-ink)',
    prep: 'var(--cc-warn)',
    attente: 'var(--cc-text-3)',
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
          className="cc-mono truncate whitespace-nowrap text-[12px]"
          style={{ color: 'var(--cc-text)' }}
        >
          #{order.order_number || order.id.slice(0, 8)}
        </div>
        <div
          className="mt-[1px] flex items-center gap-2 whitespace-nowrap text-[11px]"
          style={{ color: 'var(--cc-text-3)' }}
        >
          <span>{statusLabel}</span>
          <span style={{ color: 'var(--cc-text-3)' }}>·</span>
          <span className="cc-mono">{formatTime(order.created_at)}</span>
          {showTenant && order.tenant_name && (
            <>
              <span style={{ color: 'var(--cc-text-3)' }}>·</span>
              <span className="truncate">{order.tenant_name}</span>
            </>
          )}
        </div>
      </div>
      <div className="cc-mono whitespace-nowrap text-[12.5px]" style={{ color: 'var(--cc-text)' }}>
        {formatAmount(order.total, locale)} F
      </div>
    </>
  );

  const baseClass = cn(
    'grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5',
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
