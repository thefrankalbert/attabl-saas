'use client';

import { useState, useCallback, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Download, FileImage, FileCode, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import { captureElementToCanvas } from '@/lib/qr/capture-template';
import type { QRDesignConfig } from '@/types/qr-design.types';

// --- Types ---------------------------------------------

interface QRExportBarProps {
  config: QRDesignConfig;
  previewRef: RefObject<HTMLDivElement | null>;
  tenantSlug: string;
}

type ExportAction = 'pdf' | 'png' | 'svg' | null;

// --- Helpers ------------------------------------------

function buildFilename(slug: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `qr-${slug}-${date}.${ext}`;
}

async function getHtml2Canvas(): Promise<(typeof import('html2canvas-pro'))['default']> {
  const mod = await import('html2canvas-pro');
  return mod.default;
}

async function getJsPDF(): Promise<(typeof import('jspdf'))['jsPDF']> {
  const mod = await import('jspdf');
  return mod.jsPDF;
}

// --- Component -----------------------------------------

export function QRExportBar({ config, previewRef, tenantSlug }: QRExportBarProps) {
  const t = useTranslations('qrCodes');
  const [loading, setLoading] = useState<ExportAction>(null);

  // --- PDF Export -------------------------------------

  const downloadPDF = useCallback(async () => {
    const el = previewRef.current;
    if (!el) return;
    // The QR SVG is appended asynchronously (dynamic import + effect); capturing
    // before it paints would rasterize a QR-less card. Guard like downloadSVG.
    if (!el.querySelector('svg')) {
      logger.warn('[QRExportBar] QR not rendered yet, PDF export aborted');
      toast.error(t('exportNotReady'));
      return;
    }

    setLoading('pdf');
    try {
      const html2canvas = await getHtml2Canvas();
      const jsPDF = await getJsPDF();

      const canvas = await captureElementToCanvas(el, html2canvas);

      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = config.templateWidth;
      const pdfHeight = config.templateHeight;

      const pdf = new jsPDF({
        orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [pdfWidth, pdfHeight],
      });

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(buildFilename(tenantSlug, 'pdf'));
    } catch (err) {
      logger.error('[QRExportBar] PDF export failed', err);
      toast.error(t('exportError'));
    } finally {
      setLoading(null);
    }
  }, [previewRef, config.templateWidth, config.templateHeight, tenantSlug, t]);

  // --- PNG Export -------------------------------------

  const downloadPNG = useCallback(async () => {
    const el = previewRef.current;
    if (!el) return;
    if (!el.querySelector('svg')) {
      logger.warn('[QRExportBar] QR not rendered yet, PNG export aborted');
      toast.error(t('exportNotReady'));
      return;
    }

    setLoading('png');
    try {
      const html2canvas = await getHtml2Canvas();

      const canvas = await captureElementToCanvas(el, html2canvas);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = buildFilename(tenantSlug, 'png');
      link.href = dataUrl;
      link.click();
    } catch (err) {
      logger.error('[QRExportBar] PNG export failed', err);
      toast.error(t('exportError'));
    } finally {
      setLoading(null);
    }
  }, [previewRef, tenantSlug, t]);

  // --- SVG Export -------------------------------------

  const downloadSVG = useCallback(() => {
    const el = previewRef.current;
    if (!el) return;

    setLoading('svg');
    try {
      const svgElement = el.querySelector('svg');
      if (!svgElement) {
        logger.warn('[QRExportBar] No SVG found inside preview');
        toast.error(t('exportNotReady'));
        return;
      }

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElement);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.download = buildFilename(tenantSlug, 'svg');
      link.href = url;
      link.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('[QRExportBar] SVG export failed', err);
      toast.error(t('exportError'));
    } finally {
      setLoading(null);
    }
  }, [previewRef, tenantSlug, t]);

  // --- Render -----------------------------------------

  return (
    <div className="sticky bottom-0 bg-app-card border-t border-app-border p-4">
      <div className="flex items-center gap-3 flex-wrap">
        {/* PDF - always available */}
        <Button onClick={downloadPDF} disabled={loading !== null} className="gap-2">
          {loading === 'pdf' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {loading === 'pdf' ? t('exporting') : t('exportPdf')}
        </Button>

        {/* PNG - client-side export is free for all; the paywall is enforced
            server-side on saving/assigning a design (see qr-design actions),
            not on export (which cannot be truly enforced client-side anyway). */}
        <Button
          variant="outline"
          onClick={downloadPNG}
          disabled={loading !== null}
          className="gap-2"
        >
          {loading === 'png' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileImage className="h-4 w-4" />
          )}
          {t('exportPng')}
        </Button>

        {/* SVG */}
        <Button
          variant="outline"
          onClick={downloadSVG}
          disabled={loading !== null}
          className="gap-2"
        >
          {loading === 'svg' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileCode className="h-4 w-4" />
          )}
          {t('exportSvgOnly')}
        </Button>
        {/* Print lives in the Download tab (QRExportPanel) where QRPrintSheet
            provides the #qr-print-root isolation. Printing from here would print
            the whole admin shell, so no Print button in the customizer bar. */}
      </div>
    </div>
  );
}
