'use client';

import { useTranslations } from 'next-intl';
import { Printer, RefreshCw, CircleX, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';

interface OrdersTableSelectionBarProps {
  count: number;
  canChangeStatus: boolean;
  onBulkAdvance: () => void;
  onBulkCancel: () => void;
  onExport: () => void;
}

export function OrdersTableSelectionBar({
  count,
  canChangeStatus,
  onBulkAdvance,
  onBulkCancel,
  onExport,
}: OrdersTableSelectionBarProps) {
  const t = useTranslations('admin');
  // Annuler une commande annule une note impayee: `orders.pay` cote serveur,
  // que le serveur et le chef n'ont pas (decision du 2026-11-09).
  const canCancel = usePermissions().can('orders.pay');

  return (
    <div className="mb-3 flex items-center gap-3 rounded-[0.625rem] border border-[var(--ring)] bg-[var(--accent)] px-3 py-[7px]">
      <span className="text-[13px] font-semibold text-[var(--foreground)]">
        {t('selectedCount', { count })}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          onClick={() => window.print()}
          className="h-[30px] gap-1.5 px-2.5 text-[13px] font-normal"
        >
          <Printer className="size-[14px] text-[var(--muted-foreground)]" />
          {t('bulkPrint')}
        </Button>
        {canChangeStatus && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onBulkAdvance}
              className="h-[30px] gap-1.5 px-2.5 text-[13px] font-normal"
            >
              <RefreshCw className="size-[14px] text-[var(--muted-foreground)]" />
              {t('bulkStatus')}
            </Button>
            {canCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onBulkCancel}
                className="h-[30px] gap-1.5 px-2.5 text-[13px] font-normal text-[var(--destructive)]"
              >
                <CircleX className="size-[14px]" />
                {t('bulkCancel')}
              </Button>
            )}
          </>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onExport}
          className="h-[30px] gap-1.5 px-2.5 text-[13px] font-normal"
        >
          <Download className="size-[14px] text-[var(--muted-foreground)]" />
          {t('bulkExport')}
        </Button>
      </div>
    </div>
  );
}
