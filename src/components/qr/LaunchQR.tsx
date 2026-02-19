'use client';

import { useRef, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, FileImage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface LaunchQRProps {
  url: string;
  tenantName: string;
  logoUrl?: string;
  primaryColor?: string;
  template?: 'standard' | 'chevalet' | 'carte';
  qrStyle?: string;
  ctaText?: string;
  descriptionText?: string;
  onDownload?: () => void;
}

const QR_STYLES = [
  { id: 'classic', fg: '#000000', bg: '#FFFFFF' },
  { id: 'branded', fg: 'primary', bg: '#FFFFFF' },
  { id: 'inverted', fg: '#FFFFFF', bg: '#000000' },
  { id: 'dark', fg: '#FFFFFF', bg: '#1a1a1a' },
];

export function LaunchQR({
  url,
  tenantName,
  primaryColor,
  template = 'standard',
  qrStyle = 'branded',
  ctaText,
  descriptionText,
  onDownload,
}: LaunchQRProps) {
  const t = useTranslations('onboarding');
  const [downloading, setDownloading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getColors = () => {
    const style = QR_STYLES.find((s) => s.id === qrStyle) || QR_STYLES[0];
    return {
      fg: style.fg === 'primary' ? primaryColor || '#000000' : style.fg,
      bg: style.bg,
    };
  };

  const colors = getColors();
  const accent = primaryColor || '#000000';

  const downloadAs = async (format: 'pdf' | 'png') => {
    if (!qrRef.current) return;
    setDownloading(true);

    try {
      const canvas = await html2canvas(qrRef.current, {
        scale: 4,
        backgroundColor: colors.bg,
        useCORS: true,
      });

      const slug = tenantName.toLowerCase().replace(/\s/g, '-');

      if (format === 'png') {
        const link = document.createElement('a');
        link.download = `qrcode-${slug}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: template === 'carte' ? 'landscape' : 'portrait',
          unit: 'mm',
          format: template === 'carte' ? [90, 55] : [100, 100],
        });

        const w = template === 'carte' ? 90 : 100;
        const h = template === 'carte' ? 55 : 100;
        pdf.addImage(imgData, 'PNG', 0, 0, w, h);
        pdf.save(`qrcode-${slug}.pdf`);
      }

      onDownload?.();
    } catch {
      // Export failed silently
    } finally {
      setDownloading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="p-4 rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-center">
          <div className="w-32 h-32 bg-neutral-100 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  // Template-based rendering
  const renderStandard = () => (
    <div
      ref={qrRef}
      className="mx-auto flex flex-col items-center gap-3 p-6 rounded-xl"
      style={{ backgroundColor: colors.bg, maxWidth: 240 }}
    >
      <QRCodeSVG
        value={url}
        size={140}
        level="M"
        includeMargin={false}
        fgColor={colors.fg}
        bgColor={colors.bg}
      />
      {ctaText && (
        <p className="text-xs font-semibold text-center" style={{ color: colors.fg }}>
          {ctaText}
        </p>
      )}
      {descriptionText && (
        <p className="text-[10px] text-center opacity-60" style={{ color: colors.fg }}>
          {descriptionText}
        </p>
      )}
      <p className="text-[10px] font-medium opacity-40" style={{ color: colors.fg }}>
        {tenantName}
      </p>
    </div>
  );

  const renderChevalet = () => (
    <div
      ref={qrRef}
      className="mx-auto flex flex-col items-center p-6 rounded-xl"
      style={{
        backgroundColor: colors.bg,
        maxWidth: 200,
        borderLeft: `4px solid ${accent}`,
        borderRight: `4px solid ${accent}`,
      }}
    >
      <div
        className="w-full text-center py-2 rounded-t-lg mb-3 -mt-2"
        style={{ backgroundColor: accent }}
      >
        <p className="text-[10px] font-bold text-white">{tenantName}</p>
      </div>
      <QRCodeSVG
        value={url}
        size={120}
        level="M"
        includeMargin={false}
        fgColor={colors.fg}
        bgColor={colors.bg}
      />
      {ctaText && (
        <p className="text-xs font-semibold text-center mt-3" style={{ color: colors.fg }}>
          {ctaText}
        </p>
      )}
      {descriptionText && (
        <p className="text-[10px] text-center mt-1 opacity-60" style={{ color: colors.fg }}>
          {descriptionText}
        </p>
      )}
    </div>
  );

  const renderCarte = () => (
    <div
      ref={qrRef}
      className="mx-auto flex items-center gap-4 p-4 rounded-xl"
      style={{ backgroundColor: colors.bg, maxWidth: 320 }}
    >
      <QRCodeSVG
        value={url}
        size={80}
        level="M"
        includeMargin={false}
        fgColor={colors.fg}
        bgColor={colors.bg}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate" style={{ color: accent }}>
          {tenantName}
        </p>
        {ctaText && (
          <p className="text-[10px] mt-1" style={{ color: colors.fg }}>
            {ctaText}
          </p>
        )}
        {descriptionText && (
          <p className="text-[10px] mt-0.5 opacity-60" style={{ color: colors.fg }}>
            {descriptionText}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 rounded-xl border border-neutral-200 bg-white">
      {/* QR Preview based on template */}
      <div className="mb-4">
        {template === 'standard' && renderStandard()}
        {template === 'chevalet' && renderChevalet()}
        {template === 'carte' && renderCarte()}
      </div>

      {/* Download Buttons */}
      <div className="flex gap-2 justify-center">
        <Button
          onClick={() => downloadAs('pdf')}
          disabled={downloading}
          size="sm"
          className="bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          {t('downloadPDF')}
        </Button>
        <Button
          onClick={() => downloadAs('png')}
          disabled={downloading}
          size="sm"
          variant="outline"
          className="rounded-lg text-xs"
        >
          <FileImage className="h-3.5 w-3.5 mr-1.5" />
          {t('downloadPNG')}
        </Button>
      </div>
    </div>
  );
}
