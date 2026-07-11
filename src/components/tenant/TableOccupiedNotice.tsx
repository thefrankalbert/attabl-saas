'use client';

import { useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useTableOccupied } from '@/hooks/queries/useTableOccupied';

interface TableOccupiedNoticeProps {
  tenantId: string;
  tableNumber?: string;
}

/**
 * Soft, dismissible warning shown when a customer scans a QR for a table that
 * already has an open session (a likely other party). Non-blocking: it never
 * stops the order, it just nudges the customer to check with the staff. Renders
 * nothing when there is no table, the table is free, the check errors, or the
 * customer dismissed it.
 */
export function TableOccupiedNotice({ tenantId, tableNumber }: TableOccupiedNoticeProps) {
  const t = useTranslations('tenant');
  const [dismissed, setDismissed] = useState(false);
  const { data: occupied } = useTableOccupied(tenantId, tableNumber);

  if (!occupied || dismissed) return null;

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
