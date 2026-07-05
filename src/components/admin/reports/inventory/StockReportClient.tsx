'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Printer, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InventoryReportSheet, type ReportTenant } from './InventoryReportSheet';
import {
  buildStockReport,
  reportToCsv,
  type StockReportModel,
} from '@/lib/reports/inventory-report';
import type { StockStatus } from '@/types/inventory.types';
import type { CurrencyCode } from '@/types/admin.types';

interface StockReportClientProps {
  tenant: ReportTenant;
  stock: StockStatus[];
  currency: CurrencyCode;
  generatedAt: string; // ISO date string, formatted by the server for stable SSR
}

const MODELS: StockReportModel[] = ['simple', 'detailed', 'count-sheet'];
type Orientation = 'portrait' | 'landscape';

export function StockReportClient({
  tenant,
  stock,
  currency,
  generatedAt,
}: StockReportClientProps) {
  const t = useTranslations('reports');
  const [model, setModel] = useState<StockReportModel>('simple');
  const [orientation, setOrientation] = useState<Orientation>('portrait');

  const labels = useMemo(
    () => ({
      ingredient: t('colIngredient'),
      unit: t('colUnit'),
      stock: t('colStock'),
      minAlert: t('colMinAlert'),
      theoretical: t('colTheoretical'),
      counted: t('colCounted'),
      gap: t('colGap'),
      category: t('colCategory'),
      unitCost: t('colUnitCost'),
      value: t('colValue'),
      status: t('colStatus'),
      low: t('statusLow'),
      ok: t('statusOk'),
      total: t('total'),
    }),
    [t],
  );

  const table = useMemo(
    () => buildStockReport(stock, model, currency, labels),
    [stock, model, currency, labels],
  );

  const subtitle = t('stockGeneratedOn', { date: generatedAt, count: stock.length });

  function downloadCsv() {
    const blob = new Blob([`﻿${reportToCsv(table)}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-${model}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6 py-6">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 px-1 print:hidden">
        <div className="space-y-1.5">
          <Label className="text-xs text-app-text-secondary flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            {t('reportModel')}
          </Label>
          <Select value={model} onValueChange={(v) => setModel(v as StockReportModel)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`model_${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-app-text-secondary">{t('orientation')}</Label>
          <Select value={orientation} onValueChange={(v) => setOrientation(v as Orientation)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait">{t('portrait')}</SelectItem>
              <SelectItem value="landscape">{t('landscape')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" />
            {t('print')}
          </Button>
          <Button variant="outline" onClick={downloadCsv} className="gap-2">
            <Download className="w-4 h-4" />
            {t('exportCsv')}
          </Button>
        </div>
      </div>

      {/* Sheet preview */}
      <div className="overflow-x-auto rounded-xl border border-app-border bg-app-elevated p-4 print:border-0 print:bg-transparent print:p-0">
        <InventoryReportSheet
          tenant={tenant}
          title={t('stockReportTitle')}
          subtitle={subtitle}
          table={table}
          orientation={orientation}
        />
      </div>

      {/* Print isolation: only #report-sheet prints */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #report-sheet, #report-sheet * { visibility: visible !important; }
          #report-sheet { position: absolute; left: 0; top: 0; width: 100% !important; }
          @page { size: A4 ${orientation}; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
