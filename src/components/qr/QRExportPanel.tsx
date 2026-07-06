'use client';

import { useRef, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Download, Printer, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StyledQR } from '@/components/qr/StyledQR';
import { QRPrintSheet } from '@/components/qr/QRPrintSheet';
import { TEMPLATE_REGISTRY } from '@/components/qr/templates';
import { captureElementToCanvas } from '@/lib/qr/capture-template';
import { computeTiling } from '@/lib/qr/pdf-tiling';
import { logger } from '@/lib/logger';
import {
  CARD_FORMAT_PRESETS,
  QR_MESSAGE_MAX_LENGTH,
  type QRDesignConfig,
  type QRCardFormatId,
  type QRPerPage,
} from '@/types/qr-design.types';

interface QRExportPanelProps {
  config: QRDesignConfig;
  updateField: <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => void;
  url: string;
  tenantName: string;
  tableName?: string;
  logoUrl?: string;
}

const FORMAT_IDS: QRCardFormatId[] = [
  'standard-25x13',
  'square-10',
  'a6-chevalet',
  'business-card',
  'bare',
  'custom',
];

const PER_PAGE_OPTIONS: QRPerPage[] = [1, 2, 4, 'auto'];

export function QRExportPanel({
  config,
  updateField,
  url,
  tenantName,
  tableName,
  logoUrl,
}: QRExportPanelProps) {
  const t = useTranslations('qrCodes');
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { printLayout } = config;
  const TemplateComponent = TEMPLATE_REGISTRY[config.templateId];

  // Card physical size (mm). A bare QR is a square sized to the smaller side.
  const cardWmm = printLayout.bareQr
    ? Math.min(config.templateWidth, config.templateHeight)
    : config.templateWidth;
  const cardHmm = printLayout.bareQr
    ? Math.min(config.templateWidth, config.templateHeight)
    : config.templateHeight;

  const tiling = useMemo(
    () => computeTiling(cardWmm, cardHmm, printLayout.perPage),
    [cardWmm, cardHmm, printLayout.perPage],
  );

  // A4 preview scaled to ~fit 240px tall.
  const previewScale = 240 / tiling.pageH;

  // The card rendered for both PDF capture and print isolation.
  const cardContent = printLayout.bareQr ? (
    <div style={{ padding: 16, backgroundColor: '#FFFFFF' }}>
      <StyledQR
        value={url}
        size={config.qrSize}
        fgColor={config.qrFgColor}
        bgColor={config.qrBgColor}
        dotStyle={config.qrDotStyle}
        cornerStyle={config.qrCornerStyle}
        errorCorrection={config.errorCorrection}
        logoSrc={config.logo.enabled ? config.logo.src : undefined}
        margin={config.marginSize}
      />
    </div>
  ) : (
    <TemplateComponent
      config={config}
      url={url}
      tenantName={tenantName}
      tableName={tableName}
      logoUrl={logoUrl}
    />
  );

  function setFormat(fmt: QRCardFormatId) {
    updateField('printLayout', { ...printLayout, cardFormat: fmt });
    if (fmt !== 'custom') {
      const preset = CARD_FORMAT_PRESETS[fmt];
      updateField('templateWidth', preset.width);
      updateField('templateHeight', preset.height);
    }
  }

  async function handleExportPdf() {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await captureElementToCanvas(
        cardRef.current,
        html2canvas as unknown as Parameters<typeof captureElementToCanvas>[1],
      );
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: tiling.orientation,
        unit: 'mm',
        format: 'a4',
      });
      tiling.cells.forEach((cell) => {
        pdf.addImage(imgData, 'PNG', cell.x, cell.y, cell.w, cell.h);
      });
      pdf.save(`qr-${tenantName.toLowerCase().replace(/\s+/g, '-')}.pdf`);
      toast.success(t('exportDone'));
    } catch (error) {
      logger.error('QR export error', error);
      toast.error(t('exportError'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* --- Controls --- */}
      <div className="space-y-5">
        {/* Format */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-app-text-secondary">{t('cardFormat')}</Label>
          <Select
            value={printLayout.cardFormat}
            onValueChange={(v) => setFormat(v as QRCardFormatId)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {CARD_FORMAT_PRESETS[id].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {printLayout.cardFormat !== 'custom' && !printLayout.bareQr && (
            <p className="text-xs text-app-text-muted">
              {config.templateWidth} x {config.templateHeight} mm
            </p>
          )}
        </div>

        {/* Custom dimensions */}
        {printLayout.cardFormat === 'custom' && (
          <div className="space-y-4 rounded-lg border border-app-border p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-app-text-muted">{t('width')}</Label>
                <span className="text-xs font-mono text-app-text-muted">
                  {config.templateWidth} mm
                </span>
              </div>
              <Slider
                value={[config.templateWidth]}
                min={40}
                max={300}
                step={1}
                onValueChange={([v]: number[]) => updateField('templateWidth', v)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-app-text-muted">{t('height')}</Label>
                <span className="text-xs font-mono text-app-text-muted">
                  {config.templateHeight} mm
                </span>
              </div>
              <Slider
                value={[config.templateHeight]}
                min={40}
                max={300}
                step={1}
                onValueChange={([v]: number[]) => updateField('templateHeight', v)}
              />
            </div>
          </div>
        )}

        {/* Bare QR */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="qr-bare" className="cursor-pointer">
              {t('bareQr')}
            </Label>
            <p className="text-xs text-app-text-muted">{t('bareQrHint')}</p>
          </div>
          <Switch
            id="qr-bare"
            checked={printLayout.bareQr}
            onCheckedChange={(v) => updateField('printLayout', { ...printLayout, bareQr: v })}
          />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="qr-msg" className="cursor-pointer">
              {t('messageLabel')}
            </Label>
            <Switch
              id="qr-msg"
              checked={printLayout.message.enabled}
              onCheckedChange={(v) =>
                updateField('printLayout', {
                  ...printLayout,
                  message: { ...printLayout.message, enabled: v },
                })
              }
            />
          </div>
          {printLayout.message.enabled && (
            <Textarea
              value={printLayout.message.text}
              maxLength={QR_MESSAGE_MAX_LENGTH}
              placeholder={t('messagePlaceholder')}
              onChange={(e) =>
                updateField('printLayout', {
                  ...printLayout,
                  message: { ...printLayout.message, text: e.target.value },
                })
              }
            />
          )}
        </div>

        {/* Tiling */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-app-text-secondary">{t('perPage')}</Label>
          <Select
            value={String(printLayout.perPage)}
            onValueChange={(v) =>
              updateField('printLayout', {
                ...printLayout,
                perPage: (v === 'auto' ? 'auto' : Number(v)) as QRPerPage,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PER_PAGE_OPTIONS.map((p) => (
                <SelectItem key={String(p)} value={String(p)}>
                  {t(`perPage_${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleExportPdf} disabled={exporting} className="gap-2">
            <Download className="w-4 h-4" />
            {exporting ? t('exporting') : t('exportPdf')}
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" />
            {t('print')}
          </Button>
        </div>
      </div>

      {/* --- A4 layout preview --- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-app-text-secondary">{t('printPreview')}</Label>
          <span className="text-xs text-app-text-muted">
            A4 {tiling.orientation === 'landscape' ? t('landscape') : t('portrait')} -{' '}
            {t('perPageCount', { count: tiling.perPage })}
          </span>
        </div>
        <div className="flex items-center justify-center rounded-xl border border-app-border bg-app-bg p-6">
          <div
            className="relative bg-white shadow-sm"
            style={{
              width: `${tiling.pageW * previewScale}px`,
              height: `${tiling.pageH * previewScale}px`,
            }}
          >
            {tiling.cells.map((cell, i) => (
              <div
                key={i}
                className="absolute flex items-center justify-center border border-dashed border-app-border/70"
                style={{
                  left: `${cell.x * previewScale}px`,
                  top: `${cell.y * previewScale}px`,
                  width: `${cell.w * previewScale}px`,
                  height: `${cell.h * previewScale}px`,
                }}
              >
                <QrCode className="w-1/2 h-1/2 text-app-text-muted/50" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- Hidden full-size card for capture --- */}
      <div style={{ position: 'absolute', left: '-99999px', top: 0 }} aria-hidden>
        <div ref={cardRef}>{cardContent}</div>
      </div>

      {/* --- Print-only isolated card --- */}
      <QRPrintSheet>{cardContent}</QRPrintSheet>
    </div>
  );
}
