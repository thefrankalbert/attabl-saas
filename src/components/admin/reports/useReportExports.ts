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
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      // Neutral document palette (matches the print documents).
      const INK: [number, number, number] = [24, 24, 27];
      const MUTED: [number, number, number] = [113, 113, 122];
      const FAINT: [number, number, number] = [161, 161, 170];
      const LINE: [number, number, number] = [228, 228, 231];
      const M = 16; // margin
      const RIGHT = 210 - M;
      let y = 22;

      // --- Header ---
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...INK);
      doc.setFontSize(22);
      doc.text(t('activityReport'), M, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      doc.text(t('periodLabel', { period: periodDisplayLabel }), M, y);
      y += 5;
      doc.text(t('generatedOn', { date: format(new Date(), 'dd/MM/yyyy HH:mm') }), M, y);
      y += 6;
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.3);
      doc.line(M, y, RIGHT, y);
      y += 12;

      // --- Summary stats (3 columns) ---
      const stats: Array<[string, string]> = [
        [t('revenueLabel'), fmt(summary.revenue)],
        [t('orders'), String(summary.orders)],
        [t('averageBasket'), fmt(summary.avgBasket)],
      ];
      const colW = (RIGHT - M) / 3;
      stats.forEach(([label, value], i) => {
        const x = M + i * colW;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...FAINT);
        doc.text(label.toUpperCase(), x, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(...INK);
        doc.text(value, x, y + 7);
      });
      y += 18;

      // --- Tables (autoTable: clean columns, auto-wrap long names, auto page breaks) ---
      const sectionTitle = (title: string, atY: number): number => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...INK);
        doc.text(title, M, atY);
        return atY + 4;
      };

      const bodyStyles = {
        font: 'helvetica' as const,
        fontSize: 9.5,
        textColor: INK,
        cellPadding: { top: 2, right: 1, bottom: 2, left: 1 },
        overflow: 'linebreak' as const,
        lineColor: [245, 245, 245] as [number, number, number],
        lineWidth: { bottom: 0.1 },
      };
      const headStyles = {
        fontStyle: 'bold' as const,
        fontSize: 7.5,
        textColor: FAINT,
        fillColor: [255, 255, 255] as [number, number, number],
        cellPadding: { top: 0, right: 1, bottom: 2, left: 1 },
        lineColor: LINE,
        lineWidth: { bottom: 0.3 },
      };

      // Top products - the name column wraps (overflow: linebreak) so long names
      // never bleed into the number columns, and autoTable adds pages as needed.
      autoTable(doc, {
        startY: sectionTitle(t('top5Products'), y),
        theme: 'plain',
        margin: { left: M, right: M },
        head: [['#', 'Nom', t('orders'), t('revenueLabel')]],
        body: topItems.map((item, i) => [
          String(i + 1),
          item.name,
          String(item.quantity),
          fmt(item.revenue),
        ]),
        styles: bodyStyles,
        headStyles,
        columnStyles: {
          0: { cellWidth: 8, halign: 'left' },
          1: { cellWidth: 'auto', halign: 'left' },
          2: { cellWidth: 26, halign: 'right', textColor: MUTED },
          3: { cellWidth: 32, halign: 'right' },
        },
      });
      // jspdf-autotable exposes finalY on the doc; the type augmentation is not
      // pulled in by the dynamic import, so read it via a local typed cast.
      y = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      // Categories (optional)
      if (categories.length > 0) {
        autoTable(doc, {
          startY: sectionTitle(t('categoryBreakdown'), y),
          theme: 'plain',
          margin: { left: M, right: M },
          head: [['Categorie', t('revenueLabel'), '%']],
          body: categories.map((cat) => [cat.category, fmt(cat.revenue), `${cat.percentage}%`]),
          styles: bodyStyles,
          headStyles,
          columnStyles: {
            0: { cellWidth: 'auto', halign: 'left' },
            1: { cellWidth: 34, halign: 'right' },
            2: { cellWidth: 20, halign: 'right', textColor: MUTED },
          },
        });
      }

      // --- Footer on every page (page count is known only after the tables) ---
      const pageCount = doc.getNumberOfPages();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...FAINT);
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.text('Powered by ATTABL', M, pageH - 8);
        doc.text(`${p}/${pageCount}`, RIGHT, pageH - 8, { align: 'right' });
      }

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
