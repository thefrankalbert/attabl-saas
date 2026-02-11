'use client';

import { useState, useCallback, type RefObject } from 'react';
import { Download, Printer, FileImage, FileCode, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeatureGate } from '@/components/qr/FeatureGate';
import type { QRDesignConfig } from '@/types/qr-design.types';

// ─── Types ─────────────────────────────────────────────

interface QRExportBarProps {
  config: QRDesignConfig;
  previewRef: RefObject<HTMLDivElement | null>;
  tenantSlug: string;
}

type ExportAction = 'pdf' | 'png' | 'svg' | 'print' | null;

// ─── Helpers ──────────────────────────────────────────

function buildFilename(slug: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `qr-${slug}-${date}.${ext}`;
}

async function getHtml2Canvas(): Promise<(typeof import('html2canvas'))['default']> {
  const mod = await import('html2canvas');
  return mod.default;
}

async function getJsPDF(): Promise<(typeof import('jspdf'))['jsPDF']> {
  const mod = await import('jspdf');
  return mod.jsPDF;
}

// ─── Component ─────────────────────────────────────────

export function QRExportBar({ config, previewRef, tenantSlug }: QRExportBarProps) {
  const [loading, setLoading] = useState<ExportAction>(null);

  // ─── PDF Export ─────────────────────────────────────

  const downloadPDF = useCallback(async () => {
    const el = previewRef.current;
    if (!el) return;

    setLoading('pdf');
    try {
      const html2canvas = await getHtml2Canvas();
      const jsPDF = await getJsPDF();

      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        backgroundColor: null,
      });

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
      console.error('[QRExportBar] PDF export failed:', err);
    } finally {
      setLoading(null);
    }
  }, [previewRef, config.templateWidth, config.templateHeight, tenantSlug]);

  // ─── PNG Export ─────────────────────────────────────

  const downloadPNG = useCallback(async () => {
    const el = previewRef.current;
    if (!el) return;

    setLoading('png');
    try {
      const html2canvas = await getHtml2Canvas();

      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        backgroundColor: null,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = buildFilename(tenantSlug, 'png');
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('[QRExportBar] PNG export failed:', err);
    } finally {
      setLoading(null);
    }
  }, [previewRef, tenantSlug]);

  // ─── SVG Export ─────────────────────────────────────

  const downloadSVG = useCallback(() => {
    const el = previewRef.current;
    if (!el) return;

    setLoading('svg');
    try {
      const svgElement = el.querySelector('svg');
      if (!svgElement) {
        console.warn('[QRExportBar] No SVG found inside preview');
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
      console.error('[QRExportBar] SVG export failed:', err);
    } finally {
      setLoading(null);
    }
  }, [previewRef, tenantSlug]);

  // ─── Print ──────────────────────────────────────────

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
      <div className="flex items-center gap-3 flex-wrap">
        {/* PDF — always available */}
        <Button onClick={downloadPDF} disabled={loading !== null} className="gap-2">
          {loading === 'pdf' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {loading === 'pdf' ? 'Export...' : 'T\u00e9l\u00e9charger PDF'}
        </Button>

        {/* PNG — premium */}
        <FeatureGate feature="qrAdvancedExport">
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
            PNG
          </Button>
        </FeatureGate>

        {/* SVG — premium */}
        <FeatureGate feature="qrAdvancedExport">
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
            SVG (QR seul)
          </Button>
        </FeatureGate>

        {/* Print — always available */}
        <Button
          variant="outline"
          onClick={handlePrint}
          disabled={loading !== null}
          className="gap-2 ml-auto"
        >
          <Printer className="h-4 w-4" />
          Imprimer
        </Button>
      </div>
    </div>
  );
}
