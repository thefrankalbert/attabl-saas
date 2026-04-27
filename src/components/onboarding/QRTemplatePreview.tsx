/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileImage, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TEMPLATE_REGISTRY } from '@/components/qr/templates';
import { TEMPLATE_DEFAULTS } from '@/types/qr-design.types';
import { onboardingDataToQRConfig } from '@/components/onboarding/utils/qr-config-bridge';
import { getTenantUrl } from '@/lib/constants';
import type { OnboardingData } from '@/app/onboarding/page';

interface QRTemplatePreviewProps {
  data: OnboardingData;
}

const MM_PER_PX = 3.78;
const MAX_PREVIEW_HEIGHT_PX = 380;
const MAX_PREVIEW_WIDTH_PX = 280;
const EXPORT_SCALE = 4;
// Wait long enough for QRCodeCanvas internal useEffect + logo image load
// before triggering html2canvas. Empirically 500ms covers most logo CDNs.
const EXPORT_RENDER_WAIT_MS = 500;

function isPdfUrl(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split('?')[0].split('#')[0].toLowerCase();
  return path.endsWith('.pdf');
}

/** Returns a same-origin proxy URL for a Supabase Storage asset, so html2canvas
 *  can capture it without CORS-tainting the canvas. Returns the original URL
 *  unchanged for non-Supabase URLs. */
function toExportSafeUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return url;
  try {
    const parsed = new URL(url);
    const allowed = new URL(supabaseUrl).origin;
    if (parsed.origin !== allowed) return url;
    return `/api/onboarding/proxy-image?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

export function QRTemplatePreview({ data }: QRTemplatePreviewProps) {
  const t = useTranslations('onboarding');
  const exportRef = useRef<HTMLDivElement>(null);
  // exportingFormat is non-null only DURING an export. The clone is rendered
  // only when this is set; this avoids any DOM blocking when not exporting.
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'png' | null>(null);
  const [downloading, setDownloading] = useState<'pdf' | 'png' | null>(null);

  const templateId = data.qrTemplate ?? 'standard';
  const config = useMemo(() => onboardingDataToQRConfig(data, templateId), [data, templateId]);
  const defaults = TEMPLATE_DEFAULTS[templateId] ?? TEMPLATE_DEFAULTS.standard;

  const widthMm = data.qrSupportWidth ?? defaults.width;
  const heightMm = data.qrSupportHeight ?? defaults.height;

  const widthPx = widthMm * MM_PER_PX;
  const heightPx = heightMm * MM_PER_PX;
  // Scale to fit the preview frame as tightly as possible. This makes
  // textScale and qrPosition changes visibly impactful in the preview.
  const scale = Math.min(MAX_PREVIEW_HEIGHT_PX / heightPx, MAX_PREVIEW_WIDTH_PX / widthPx, 1);

  const url = data.tenantSlug ? getTenantUrl(data.tenantSlug) : 'https://attabl.com';
  const tenantName = data.qrCustomName || data.tenantName || 'Mon resto';
  const TemplateComponent = TEMPLATE_REGISTRY[templateId] ?? TEMPLATE_REGISTRY.standard;

  const hasUpload = !!data.qrUploadedDesignUrl;
  const orientation = data.qrOrientation ?? 'portrait';

  // Capture the clone once it has mounted and rendered.
  useEffect(() => {
    if (!exportingFormat || !exportRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        // Wait for QRCodeCanvas internal useEffect + logo image load.
        // QRCodeCanvas renders its canvas via its own useEffect AFTER React commits,
        // and async-loads the logo image via new Image(), redrawing on load.
        // 500ms covers both reliably.
        await new Promise<void>((r) => setTimeout(r, EXPORT_RENDER_WAIT_MS));
        if (cancelled || !exportRef.current) return;

        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(exportRef.current, {
          scale: EXPORT_SCALE,
          useCORS: true,
          backgroundColor: null,
        });

        if (cancelled) return;
        const slug = tenantName.toLowerCase().replace(/\s/g, '-');

        if (exportingFormat === 'png') {
          const link = document.createElement('a');
          link.download = `qr-${slug}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        } else {
          const { jsPDF } = await import('jspdf');
          const pdf = new jsPDF({
            orientation: widthMm > heightMm ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [widthMm, heightMm],
          });
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 0, 0, widthMm, heightMm);
          pdf.save(`qr-${slug}.pdf`);
        }
      } catch {
        // Export failed silently
      } finally {
        if (!cancelled) {
          setExportingFormat(null);
          setDownloading(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exportingFormat, tenantName, widthMm, heightMm]);

  const handleDownload = (format: 'pdf' | 'png') => {
    if (downloading) return;
    setDownloading(format);
    setExportingFormat(format);
  };

  const renderTemplate = (forExport = false) => {
    // For export, route Supabase Storage assets through our same-origin proxy
    // so html2canvas does not taint the canvas via cross-origin image loads.
    const safeLogoUrl = forExport ? toExportSafeUrl(data.logoUrl || undefined) : data.logoUrl;
    const safeUploadedUrl = forExport
      ? toExportSafeUrl(data.qrUploadedDesignUrl)
      : data.qrUploadedDesignUrl;
    const exportConfig =
      forExport && config.logo.src
        ? { ...config, logo: { ...config.logo, src: toExportSafeUrl(config.logo.src) || '' } }
        : config;

    return hasUpload ? (
      <div
        style={{
          width: `${widthPx}px`,
          height: `${heightPx}px`,
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: forExport ? 'visible' : 'hidden',
        }}
      >
        {isPdfUrl(safeUploadedUrl) ? (
          <span className="text-3xl font-bold">PDF</span>
        ) : (
          <img
            src={safeUploadedUrl}
            alt="Uploaded design"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        )}
      </div>
    ) : (
      <TemplateComponent
        config={exportConfig}
        url={url}
        tenantName={tenantName}
        logoUrl={safeLogoUrl || undefined}
        isExport={forExport}
      />
    );
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-start px-6 py-6 gap-3">
      <div className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted">
          {t('qrPreviewLabel') || 'Apercu en temps reel'}
        </p>
      </div>

      {/* Visible scaled preview */}
      <div
        className="relative flex items-center justify-center rounded-2xl overflow-hidden"
        style={{
          width: `${MAX_PREVIEW_WIDTH_PX + 32}px`,
          minHeight: `${MAX_PREVIEW_HEIGHT_PX}px`,
          backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
          backgroundSize: '12px 12px',
          backgroundColor: 'var(--app-elevated)',
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center',
          }}
        >
          {renderTemplate(false)}
        </div>
      </div>

      {/* Hidden full-resolution clone — mounted ONLY during export, then unmounted.
          Positioned offscreen via top/left negative — NO overflow:hidden parent (it would
          clip html2canvas), NO opacity (it would blank the export). */}
      {exportingFormat && (
        <div
          ref={exportRef}
          style={{
            position: 'fixed',
            top: '-99999px',
            left: '-99999px',
            width: `${widthPx}px`,
            height: `${heightPx}px`,
            pointerEvents: 'none',
          }}
        >
          {renderTemplate(true)}
        </div>
      )}

      <div className="text-center">
        <p className="text-xs font-semibold text-app-text">
          {hasUpload
            ? t('qrUploadedDesign') || 'Design personnalise'
            : t(`qrTemplate${templateId.charAt(0).toUpperCase()}${templateId.slice(1)}`) ||
              templateId}
        </p>
        <p className="text-[11px] text-app-text-muted mt-0.5 tabular-nums">
          {widthMm} x {heightMm} mm
          {orientation === 'landscape' ? ' - Paysage' : ' - Portrait'}
        </p>
      </div>

      <div className="flex gap-1.5 mt-1">
        <Button
          type="button"
          onClick={() => handleDownload('pdf')}
          disabled={downloading !== null}
          className="h-8 px-3 bg-neutral-900 hover:bg-neutral-800 text-white rounded-full text-[11px] font-medium"
        >
          {downloading === 'pdf' ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Download className="h-3 w-3 mr-1" />
          )}
          PDF
        </Button>
        <Button
          type="button"
          onClick={() => handleDownload('png')}
          disabled={downloading !== null}
          variant="outline"
          className="h-8 px-3 rounded-full text-[11px] font-medium"
        >
          {downloading === 'png' ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <FileImage className="h-3 w-3 mr-1" />
          )}
          PNG
        </Button>
      </div>
    </div>
  );
}
