'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Download, FileImage, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import type { QRDesignConfig } from '@/types/qr-design.types';
import { TEMPLATE_DEFAULTS } from '@/types/qr-design.types';
import { TEMPLATE_REGISTRY } from '@/components/qr/templates';

interface LaunchQRProps {
  config: QRDesignConfig;
  url: string;
  tenantName: string;
  logoUrl?: string;
}

export function LaunchQR({ config, url, tenantName, logoUrl }: LaunchQRProps) {
  const t = useTranslations('onboarding');
  const [downloading, setDownloading] = useState<'pdf' | 'png' | null>(null);
  const [mounted, setMounted] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const TemplateComponent = TEMPLATE_REGISTRY[config.templateId];
  const defaults = TEMPLATE_DEFAULTS[config.templateId];

  // Scale to fit within the onboarding panel (~300px wide)
  const templateWidthPx = config.templateWidth * 3.78;
  const scale = Math.min(280 / templateWidthPx, 0.7);

  const downloadAs = useCallback(
    async (format: 'pdf' | 'png') => {
      if (!templateRef.current) return;
      setDownloading(format);

      try {
        const html2canvas = (await import('html2canvas')).default;

        const canvas = await html2canvas(templateRef.current, {
          scale: 3,
          useCORS: true,
          backgroundColor: null,
        });

        const slug = tenantName.toLowerCase().replace(/\s/g, '-');

        if (format === 'png') {
          const link = document.createElement('a');
          link.download = `qr-${slug}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        } else {
          const { jsPDF } = await import('jspdf');
          const pdfWidth = defaults.width;
          const pdfHeight = defaults.height;

          const pdf = new jsPDF({
            orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [pdfWidth, pdfHeight],
          });

          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`qr-${slug}.pdf`);
        }
      } catch {
        // Export failed silently
      } finally {
        setDownloading(null);
      }
    },
    [tenantName, defaults.width, defaults.height],
  );

  if (!mounted) {
    return (
      <div className="p-4 rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-center" style={{ minHeight: 200 }}>
          <div className="w-32 h-32 bg-neutral-100 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      {/* Template Preview — dot pattern background */}
      <div
        className="bg-neutral-100 p-6 flex items-center justify-center"
        style={{
          minHeight: 260,
          backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
          backgroundSize: '12px 12px',
        }}
      >
        <div
          ref={templateRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center',
          }}
        >
          <TemplateComponent config={config} url={url} tenantName={tenantName} logoUrl={logoUrl} />
        </div>
      </div>

      {/* Download Buttons */}
      <div className="flex gap-2 justify-center p-3 border-t border-neutral-100">
        <Button
          onClick={() => downloadAs('pdf')}
          disabled={downloading !== null}
          size="sm"
          className="bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs"
        >
          {downloading === 'pdf' ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5 mr-1.5" />
          )}
          {t('downloadPDF')}
        </Button>
        <Button
          onClick={() => downloadAs('png')}
          disabled={downloading !== null}
          size="sm"
          variant="outline"
          className="rounded-lg text-xs"
        >
          {downloading === 'png' ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <FileImage className="h-3.5 w-3.5 mr-1.5" />
          )}
          {t('downloadPNG')}
        </Button>
      </div>
    </div>
  );
}
