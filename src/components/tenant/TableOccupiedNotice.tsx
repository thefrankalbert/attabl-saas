'use client';

import { useState, useSyncExternalStore } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useTableOccupied } from '@/hooks/queries/useTableOccupied';
import { noopSubscribe } from '@/lib/utils/noop-subscribe';

interface TableOccupiedNoticeProps {
  tenantId: string;
  tenantSlug: string;
  tableNumber?: string;
}

/**
 * Soft, dismissible warning shown when a customer ARRIVES at a table that already
 * has an open session (a likely other party). Non-blocking: it never stops the
 * order, it just nudges the customer to check with the staff. Renders nothing
 * when there is no table, the table is free, the check errors, the customer
 * dismissed it, OR this device already placed an order for this tenant - in which
 * case the open session is the customer's OWN and the warning would be wrong.
 */
export function TableOccupiedNotice({
  tenantId,
  tenantSlug,
  tableNumber,
}: TableOccupiedNoticeProps) {
  const t = useTranslations('tenant');
  const [dismissed, setDismissed] = useState(false);
  const { data: occupied } = useTableOccupied(tenantId, tableNumber);

  // A session this device created (by ordering) is not "another party". Read the
  // placed-order ids the cart persists via useSyncExternalStore so it is
  // hydration-safe (server snapshot is false) without a setState-in-effect.
  const ownSession = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        const raw = localStorage.getItem(`attabl_${tenantSlug}_order_ids`);
        const ids = raw ? (JSON.parse(raw) as unknown[]) : [];
        return Array.isArray(ids) && ids.length > 0;
      } catch {
        return false;
      }
    },
    () => false,
  );

  if (!occupied || dismissed || ownSession) return null;

  return (
    <div
      role="status"
      className="mx-3 mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-amber-900 dark:text-amber-100"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
      <p className="flex-1 text-xs leading-snug">
        {t('tableOccupiedNotice', { table: tableNumber ?? '' })}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-amber-700 hover:bg-amber-500/20 dark:text-amber-200"
        aria-label={t('tableOccupiedDismiss')}
        onClick={() => setDismissed(true)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
