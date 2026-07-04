'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { logger } from '@/lib/logger';
import { fromMinorUnits } from '@/lib/utils/money';
import { csvCell } from '@/lib/utils/csv';
import type { CurrencyCode } from '@/types/admin.types';
import type {
  CurrencyFormatter,
  ReportSummary,
  TopItem,
  DailyStats,
  CategoryBreakdown,
} from './reports.types';

interface UseReportExportsArgs {
  currency: CurrencyCode;
  fmt: CurrencyFormatter;
  periodDisplayLabel: string;
  summary: ReportSummary;
  topItems: TopItem[];
  dailyStats: DailyStats[];
  categories: CategoryBreakdown[];
}

/**
 * Export handlers for the activity report (PDF via jsPDF, CSV blob download).
 * All report amounts are integer MINOR units; CSV values are converted to MAJOR
 * units so the file carries real currency amounts (identity for XAF/XOF).
 */
export function useReportExports({
  currency,
  fmt,
  periodDisplayLabel,
  summary,
  topItems,
  dailyStats,
  categories,
}: UseReportExportsArgs) {
  const t = useTranslations('reports');
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();

      doc.setFontSize(20);
      doc.text(t('activityReport'), 20, 20);
      doc.setFontSize(10);
      doc.text(t('generatedOn', { date: format(new Date(), 'dd/MM/yyyy HH:mm') }), 20, 28);
      doc.text(t('periodLabel', { period: periodDisplayLabel }), 20, 34);

      doc.setFillColor(245, 245, 245);
      doc.rect(20, 45, 170, 30, 'F');
      doc.setFontSize(12);
      doc.text(`${t('revenueLabel')} : ${fmt(summary.revenue)}`, 30, 65);
      doc.text(`${t('orders')} : ${summary.orders}`, 100, 65);
      doc.text(`${t('averageBasket')} : ${fmt(summary.avgBasket)}`, 150, 65);

      doc.setFontSize(14);
      doc.text(t('top5Products'), 20, 90);

      let y = 100;
      topItems.forEach((item, i) => {
        doc.setFontSize(12);
        doc.text(`${i + 1}. ${item.name}`, 20, y);
        doc.text(t('salesCount', { count: item.quantity }), 120, y);
        doc.text(`${fmt(item.revenue)}`, 160, y);
        y += 10;
      });

      doc.save(`rapport_${format(new Date(), 'yyyyMMdd')}.pdf`);
      toast({ title: t('pdfDownloaded') });
    } catch (err: unknown) {
      logger.error('Failed to export PDF report', err);
      toast({ title: t('exportPdfError'), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    setExportingCsv(true);
    try {
      // Revenue values are integer MINOR units; export them in MAJOR units so the
      // CSV carries real currency amounts (identity for XAF/XOF).
      const toMajor = (minor: number) => fromMinorUnits(minor, currency);
      const rows: string[] = [];
      rows.push(`${t('activityReport')} - ${periodDisplayLabel}`);
      rows.push(`${t('generatedOn', { date: format(new Date(), 'dd/MM/yyyy HH:mm') })}`);
      rows.push('');
      rows.push(`${t('revenueLabel')},${t('orders')},${t('averageBasket')}`);
      rows.push(`${toMajor(summary.revenue)},${summary.orders},${toMajor(summary.avgBasket)}`);
      rows.push('');
      rows.push(`Date,${t('revenueLabel')},${t('orders')}`);
      dailyStats.forEach((d) => rows.push(`${d.date},${toMajor(d.revenue)},${d.orders}`));
      rows.push('');
      rows.push(`${t('top5Products')}`);
      rows.push(`#,Name,${t('salesCount', { count: 0 })},${t('revenueLabel')}`);
      topItems.forEach((item, i) =>
        rows.push(`${i + 1},${csvCell(item.name)},${item.quantity},${toMajor(item.revenue)}`),
      );
      if (categories.length > 0) {
        rows.push('');
        rows.push(t('categoryBreakdown'));
        rows.push(`Category,${t('revenueLabel')},%`);
        categories.forEach((cat) =>
          rows.push(`${csvCell(cat.category)},${toMajor(cat.revenue)},${cat.percentage}%`),
        );
      }

      const csvContent = rows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rapport_${format(new Date(), 'yyyyMMdd')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: t('csvDownloaded') });
    } catch (err: unknown) {
      logger.error('Failed to export CSV report', err);
      toast({ title: t('exportCsvError'), variant: 'destructive' });
    } finally {
      setExportingCsv(false);
    }
  };

  return { exporting, exportingCsv, handleExportPDF, handleExportCSV };
}
