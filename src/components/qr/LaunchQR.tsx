'use client';

import { useRef, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface LaunchQRProps {
  url: string;
  tenantName: string;
  logoUrl?: string;
  primaryColor?: string;
  onDownload?: () => void;
}

const qrStyles = [
  { id: 'classic', label: 'Classique', fg: '#000000', bg: '#FFFFFF' },
  { id: 'branded', label: 'Marque', fg: 'primary', bg: '#FFFFFF' },
  { id: 'inverted', label: 'Inversé', fg: '#FFFFFF', bg: '#000000' },
  { id: 'dark', label: 'Sombre', fg: '#FFFFFF', bg: '#1a1a1a' },
];

export function LaunchQR({ url, tenantName, primaryColor, onDownload }: LaunchQRProps) {
  const t = useTranslations('onboarding');
  const [downloading, setDownloading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeStyle, setActiveStyle] = useState('branded');
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getColors = () => {
    const style = qrStyles.find((s) => s.id === activeStyle) || qrStyles[0];
    return {
      fg: style.fg === 'primary' ? primaryColor || '#000000' : style.fg,
      bg: style.bg,
    };
  };

  const colors = getColors();

  const downloadQR = async () => {
    if (!qrRef.current) return;
    setDownloading(true);

    try {
      const canvas = await html2canvas(qrRef.current, {
        scale: 4,
        backgroundColor: colors.bg,
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [100, 100],
      });

      pdf.addImage(imgData, 'PNG', 0, 0, 100, 100);
      pdf.save(`qrcode-${tenantName.toLowerCase().replace(/\s/g, '-')}.pdf`);

      onDownload?.();
    } catch {
      // PDF generation failed silently
    } finally {
      setDownloading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="p-4 rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center gap-4">
          <div className="w-28 h-28 bg-neutral-100 rounded-lg animate-pulse" />
          <div className="flex-1">
            <div className="h-5 w-24 bg-neutral-100 rounded animate-pulse mb-2" />
            <div className="h-4 w-32 bg-neutral-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-start gap-4">
        {/* QR Code Preview */}
        <div
          ref={qrRef}
          className="w-28 h-28 rounded-lg flex items-center justify-center flex-shrink-0 p-2"
          style={{ backgroundColor: colors.bg }}
        >
          <QRCodeSVG
            value={url}
            size={96}
            level="M"
            includeMargin={false}
            fgColor={colors.fg}
            bgColor={colors.bg}
          />
        </div>

        {/* Info & Controls */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-neutral-900 mb-1 text-sm">{t('qrCodeTitle')}</h3>

          {/* QR Style Selector */}
          <div className="flex gap-1.5 mb-3">
            {qrStyles.map((style) => {
              const isActive = activeStyle === style.id;
              const previewFg = style.fg === 'primary' ? primaryColor || '#000' : style.fg;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setActiveStyle(style.id)}
                  className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center ${
                    isActive ? 'border-[#CCFF00]' : 'border-neutral-200'
                  }`}
                  style={{ backgroundColor: style.bg }}
                  title={style.label}
                >
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: previewFg }} />
                </button>
              );
            })}
          </div>

          <Button
            onClick={downloadQR}
            disabled={downloading}
            size="sm"
            className="bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            {downloading ? '...' : t('downloadQR')}
          </Button>
        </div>
      </div>
    </div>
  );
}
