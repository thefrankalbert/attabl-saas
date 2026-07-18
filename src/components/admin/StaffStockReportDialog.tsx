'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { ListRowsSkeleton } from '@/components/admin/skeletons/ListRowsSkeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useStaffStockReport } from '@/hooks/queries/useStaffStockReport';

type ReportPeriod = '7d' | '30d' | 'month';

interface StaffStockReportDialogProps {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function StaffStockReportDialog({
  tenantId,
  open,
  onOpenChange,
}: StaffStockReportDialogProps) {
  const t = useTranslations('stockHistory');
  const tc = useTranslations('common');
  const [period, setPeriod] = useState<ReportPeriod>('7d');

  const { startISO, endISO } = useMemo(() => {
    const now = new Date();
    const end = now.toISOString();
    if (period === '7d') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      return { startISO: start, endISO: end };
    }
    if (period === '30d') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      return { startISO: start, endISO: end };
    }
    // 'month': start of current month
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    return { startISO: start, endISO: end };
  }, [period]);

  const {
    data = [],
    isLoading,
    error,
    refetch,
  } = useStaffStockReport(tenantId, startISO, endISO, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            {t('staffReportTitle')}
          </DialogTitle>
          <DialogDescription>{t('staffReportSubtitle')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Period selector */}
          <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
            <SelectTrigger className="w-full sm:w-56 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t('staffReportPeriod7')}</SelectItem>
              <SelectItem value="30d">{t('staffReportPeriod30')}</SelectItem>
              <SelectItem value="month">{t('staffReportPeriodMonth')}</SelectItem>
            </SelectContent>
          </Select>

          {/* Content area */}
          {isLoading ? (
            <ListRowsSkeleton rows={4} />
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <p className="text-sm text-status-error">{t('staffReportError')}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {tc('retry')}
              </Button>
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-app-text-muted">{t('staffReportEmpty')}</p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-app-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('staffReportColAuthor')}</TableHead>
                    <TableHead className="text-right">{t('staffReportColOut')}</TableHead>
                    <TableHead className="text-right">{t('staffReportColIn')}</TableHead>
                    <TableHead className="text-right">{t('staffReportColCount')}</TableHead>
                    <TableHead className="text-right">{t('staffReportColManualRemove')}</TableHead>
                    <TableHead className="text-right">{t('staffReportColAdjustment')}</TableHead>
                    <TableHead className="text-right">{t('staffReportColOrderDestock')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row, idx) => (
                    <TableRow key={row.author_id ?? idx}>
                      <TableCell className="font-medium">
                        {row.author_name ?? t('unattributed')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-status-error font-semibold">
                        {row.out_qty}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-status-success font-semibold">
                        {row.in_qty}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-app-text-secondary">
                        {row.movements_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-app-text-secondary">
                        {row.manual_remove_qty}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-app-text-secondary">
                        {row.adjustment_out_qty}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-app-text-muted">
                        {row.order_destock_qty}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
