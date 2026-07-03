'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import RoleGuard from '@/components/admin/RoleGuard';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { StatusBadge } from '@/components/admin/shared/StatusBadge';
import { formatCurrency } from '@/lib/utils/currency';
import { actionGetLossesByReason } from '@/app/actions/inventory';
import type { LossByReason, LossReasonCode } from '@/types/inventory.types';
import type { CurrencyCode } from '@/types/admin.types';

interface LossesReportClientProps {
  tenantId: string;
  currency: string;
  initialRows: LossByReason[];
}

export default function LossesReportClient({
  tenantId,
  currency,
  initialRows,
}: LossesReportClientProps) {
  const t = useTranslations('losses');
  const tc = useTranslations('common');

  const [rows, setRows] = useState<LossByReason[]>(initialRows);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const reasonLabel = useCallback((code: LossReasonCode) => t(`reason_${code}`), [t]);

  const applyFilter = useCallback(async () => {
    setLoading(true);
    setError(false);
    const r = await actionGetLossesByReason(tenantId, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    if (r.success) {
      setRows(r.data ?? []);
    } else {
      setError(true);
    }
    setLoading(false);
  }, [tenantId, startDate, endDate]);

  return (
    <RoleGuard permission="canViewStocks">
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 space-y-4">
          <AdminPageHeader title={t('title')} />

          {/* Date-range filter */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                {t('from')}
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                {t('to')}
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <Button onClick={applyFilter} disabled={loading} variant="default" className="h-9">
              {t('apply')}
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 text-app-text-muted animate-spin" />
              <p className="text-sm text-app-text-muted">{tc('loading')}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <TrendingDown className="w-10 h-10 text-app-text-muted" />
              <p className="text-sm text-status-error">{tc('loadingError')}</p>
              <Button variant="outline" size="sm" onClick={applyFilter}>
                {tc('retry')}
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <TrendingDown className="w-10 h-10 text-app-text-muted" />
              <p className="text-sm text-app-text-muted">{t('empty')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reason')}</TableHead>
                  <TableHead className="text-right">{t('nbMovements')}</TableHead>
                  <TableHead className="text-right">{t('totalQty')}</TableHead>
                  <TableHead className="text-right">{t('valuedCost')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.reason_code}>
                    <TableCell>
                      <StatusBadge tone="destructive" icon={TrendingDown}>
                        {reasonLabel(row.reason_code)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-app-text-secondary">
                      {row.nb_movements}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-app-text">
                      {row.total_qty}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-app-text">
                      {formatCurrency(row.total_cost_value, currency as CurrencyCode)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
