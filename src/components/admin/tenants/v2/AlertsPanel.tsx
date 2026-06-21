'use client';

import { useTranslations } from 'next-intl';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CommandCenterAlert } from '@/types/command-center.types';

interface AlertsPanelProps {
  alerts: CommandCenterAlert[];
  onOpenDashboard: (slug: string) => void;
  /**
   * When false, the tenant name is hidden from each alert row (owner mode with
   * a single establishment). When true (default), tenant names are shown so
   * superadmins and multi-site owners can tell sites apart.
   */
  multiTenant?: boolean;
}

type AlertSeverity = CommandCenterAlert['severity'];

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  error: 'var(--cc-danger)',
  warn: 'var(--cc-warn)',
  info: 'var(--cc-accent-ink)',
};

const SEVERITY_ICON: Record<AlertSeverity, typeof AlertTriangle> = {
  error: AlertCircle,
  warn: AlertTriangle,
  info: Info,
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function AlertsPanel({ alerts, onOpenDashboard, multiTenant = true }: AlertsPanelProps) {
  const t = useTranslations('admin.tenants.commandCenter');
  const reduceMotion = useReducedMotion();
  const count = alerts.length;

  return (
    <div className="rounded-[12px] border border-[var(--cc-border)] bg-[var(--cc-surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--cc-text-3)]">
          {t('alerts.title')}
        </span>
        {count > 0 && (
          <span
            className="cc-mono inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-[1px] text-[10px] font-bold"
            style={{ background: 'var(--cc-surface-2)', color: 'var(--cc-text-2)' }}
          >
            {count}
          </span>
        )}
      </div>

      {count === 0 ? (
        <div className="flex items-center gap-2 py-6 text-xs" style={{ color: 'var(--cc-text-3)' }}>
          <CheckCircle2
            className="size-4 shrink-0"
            style={{ color: 'var(--cc-accent-ink)' }}
            strokeWidth={2}
            aria-hidden
          />
          <span>{t('alerts.empty')}</span>
        </div>
      ) : (
        <div className="flex flex-col">
          <AnimatePresence initial={false}>
            {alerts.map((alert, idx) => (
              <motion.div
                key={alert.id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              >
                <AlertRow
                  alert={alert}
                  isFirst={idx === 0}
                  showTenant={multiTenant}
                  onClick={() => onOpenDashboard(alert.tenant_slug)}
                  ariaLabel={t('alerts.viewSite', { name: alert.tenant_name })}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

interface AlertRowProps {
  alert: CommandCenterAlert;
  isFirst: boolean;
  showTenant: boolean;
  onClick: () => void;
  ariaLabel: string;
}

function AlertRow({ alert, isFirst, showTenant, onClick, ariaLabel }: AlertRowProps) {
  const Icon = SEVERITY_ICON[alert.severity];
  const color = SEVERITY_COLOR[alert.severity];

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'grid min-h-[44px] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-none px-0 py-3 text-left font-normal shadow-none transition-colors',
        'h-auto justify-start',
        !isFirst && 'border-t',
      )}
      style={{ borderColor: 'var(--cc-border)' }}
    >
      <Icon className="size-4 shrink-0" style={{ color }} strokeWidth={2} aria-hidden />
      <div className="min-w-0">
        <div
          className="truncate whitespace-nowrap text-xs font-medium"
          style={{ color: 'var(--cc-text)' }}
        >
          {alert.label}
        </div>
        {showTenant && alert.tenant_name && (
          <div
            className="mt-[1px] truncate whitespace-nowrap text-[11px]"
            style={{ color: 'var(--cc-text-3)' }}
          >
            {alert.tenant_name}
          </div>
        )}
      </div>
      <span className="cc-mono whitespace-nowrap text-[11px]" style={{ color: 'var(--cc-text-3)' }}>
        {formatTime(alert.created_at)}
      </span>
    </Button>
  );
}
