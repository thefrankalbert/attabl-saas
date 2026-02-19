'use client';

import { useState, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useQRDesignConfig } from '@/hooks/useQRDesignConfig';
import { QRCustomizerLayout } from '@/components/qr/QRCustomizerLayout';
import { QRPreview } from '@/components/qr/QRPreview';
import { QRExportBar } from '@/components/qr/QRExportBar';
import {
  QrCode,
  Info,
  Table2,
  BookOpen,
  Layers,
  Download,
  Sparkles,
  Palette,
  Check,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import type { Table, Zone } from '@/types/admin.types';
import type { QRDesignConfig } from '@/types/qr-design.types';

interface QRMenu {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

interface QRCodePageProps {
  tenant: {
    name: string;
    slug: string;
    logoUrl?: string;
    primaryColor: string;
    secondaryColor: string;
    description?: string;
  };
  menuUrl: string;
  zones: Zone[];
  tables: Table[];
  menus: QRMenu[];
}

function buildQRUrl(baseUrl: string, tableName?: string, menuSlug?: string): string {
  const url = new URL(baseUrl);
  if (tableName) url.searchParams.set('table', tableName);
  if (menuSlug) url.searchParams.set('menu', menuSlug);
  return url.toString();
}

export function QRCodePage({ tenant, menuUrl, zones, tables, menus }: QRCodePageProps) {
  const t = useTranslations('qrCodes');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedMenuId, setSelectedMenuId] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(0);
  const [maxVisited, setMaxVisited] = useState(0);
  const downloadPreviewRef = useRef<HTMLDivElement>(null);

  const goToStep = (step: number) => {
    setCurrentStep(step);
    setMaxVisited((prev) => Math.max(prev, step));
  };

  // QR Design Config (centralized state for customizer)
  const { config, updateField, setTemplate } = useQRDesignConfig(
    tenant.primaryColor,
    tenant.secondaryColor,
  );

  // Group tables by zone
  const tablesByZone = useMemo(() => {
    const grouped: Record<string, { zone: Zone; tables: Table[] }> = {};
    for (const zone of zones) {
      grouped[zone.id] = { zone, tables: [] };
    }
    for (const table of tables) {
      if (grouped[table.zone_id]) {
        grouped[table.zone_id].tables.push(table);
      }
    }
    return Object.values(grouped).filter((g) => g.tables.length > 0);
  }, [zones, tables]);

  // Compute selected table/menu objects
  const selectedTable = tables.find((t) => t.id === selectedTableId);
  const selectedMenu = menus.find((m) => m.id === selectedMenuId);

  // Build dynamic QR URL
  const qrUrl = buildQRUrl(
    menuUrl,
    selectedTable?.display_name || undefined,
    selectedMenu?.slug || undefined,
  );

  // Subtitle for the QR code
  const qrSubtitle = selectedTable ? selectedTable.display_name : undefined;

  const steps = [
    { number: 0, label: t('stepSelection'), icon: Table2 },
    { number: 1, label: t('stepCustomization'), icon: Palette },
    { number: 2, label: t('stepDownload'), icon: Download },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {/* Header — always visible */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-neutral-100 rounded-xl">
            <QrCode className="h-5 w-5 text-neutral-600" />
          </div>
          <h1 className="text-xl font-bold text-neutral-900">{t('title')}</h1>
        </div>
        <p className="text-sm text-neutral-500">{t('subtitle')}</p>
      </div>

      {/* ─── Clickable Stepper ─── */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = currentStep === step.number;
            const isCompleted = currentStep > step.number;
            const isClickable = step.number <= maxVisited;

            return (
              <div key={step.number} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  onClick={() => {
                    if (isClickable) goToStep(step.number);
                  }}
                  className={cn(
                    'flex items-center gap-2.5 transition-opacity',
                    isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold transition-colors',
                      isActive
                        ? 'bg-[#CCFF00] text-black'
                        : isCompleted
                          ? 'bg-neutral-900 text-white'
                          : isClickable
                            ? 'bg-neutral-300 text-neutral-600'
                            : 'bg-neutral-200 text-neutral-400',
                    )}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : <span>{step.number + 1}</span>}
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5">
                    <StepIcon
                      className={cn(
                        'w-4 h-4',
                        isActive
                          ? 'text-neutral-900'
                          : isCompleted || isClickable
                            ? 'text-neutral-600'
                            : 'text-neutral-300',
                      )}
                    />
                    <span
                      className={cn(
                        'text-sm',
                        isActive
                          ? 'font-bold text-neutral-900'
                          : isCompleted || isClickable
                            ? 'font-medium text-neutral-600'
                            : 'font-medium text-neutral-400',
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                </button>

                {index < steps.length - 1 && (
                  <div className="flex-1 mx-3">
                    <div
                      className={cn(
                        'h-0.5 w-full transition-colors',
                        isCompleted ? 'bg-neutral-900' : 'bg-neutral-200',
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Step 0: Sélection ─── */}
      {currentStep === 0 && (
        <div>
          {/* Info Banner */}
          <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-800">
                <strong>{t('menuUrl')} :</strong>{' '}
                <a
                  href={menuUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  {menuUrl}
                </a>
              </p>
              <p className="text-xs text-blue-600 mt-1">{t('qrRedirectInfo')}</p>
            </div>
          </div>

          {/* Table & Menu Selectors */}
          {(tables.length > 0 || menus.length > 0) && (
            <div className="bg-white rounded-xl border border-neutral-100 p-5">
              <h3 className="text-sm font-semibold text-neutral-700 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-neutral-400" />
                {t('selectTableMenu')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Table Selector */}
                {tables.length > 0 && (
                  <div>
                    <label
                      htmlFor="qr-table-select"
                      className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 mb-1.5"
                    >
                      <Table2 className="w-3.5 h-3.5" />
                      {t('table')}
                    </label>
                    <select
                      id="qr-table-select"
                      value={selectedTableId}
                      onChange={(e) => setSelectedTableId(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300 transition-all"
                    >
                      <option value="">{t('noTable')}</option>
                      {tablesByZone.map(({ zone, tables: zoneTables }) => (
                        <optgroup key={zone.id} label={zone.name}>
                          {zoneTables.map((table) => (
                            <option key={table.id} value={table.id}>
                              {table.display_name}
                              {table.capacity > 0
                                ? ` (${t('seats', { count: table.capacity })})`
                                : ''}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}

                {/* Menu Selector */}
                {menus.length > 0 && (
                  <div>
                    <label
                      htmlFor="qr-menu-select"
                      className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 mb-1.5"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      {t('menuLabel')}
                    </label>
                    <select
                      id="qr-menu-select"
                      value={selectedMenuId}
                      onChange={(e) => setSelectedMenuId(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300 transition-all"
                    >
                      <option value="">{t('allMenus')}</option>
                      {menus.map((menu) => (
                        <option key={menu.id} value={menu.id}>
                          {menu.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Dynamic URL Preview */}
              {(selectedTable || selectedMenu) && (
                <div className="mt-3 p-2.5 bg-neutral-50 rounded-xl">
                  <p className="text-xs text-neutral-500 font-mono break-all">{qrUrl}</p>
                </div>
              )}
            </div>
          )}

          {/* Selection Summary */}
          <div className="mt-4 p-4 rounded-xl bg-neutral-50 border border-neutral-100">
            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
              {t('selectionSummary')}
            </h4>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 text-sm text-neutral-700">
                <Table2 className="w-3.5 h-3.5 text-neutral-400" />
                <span>{selectedTable ? selectedTable.display_name : t('noTableSelected')}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-neutral-700">
                <BookOpen className="w-3.5 h-3.5 text-neutral-400" />
                <span>{selectedMenu ? selectedMenu.name : t('allMenus')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Step 1: Personnalisation ─── */}
      {currentStep === 1 && (
        <div className="bg-white rounded-xl border border-neutral-100 p-6">
          <QRCustomizerLayout
            config={config}
            updateField={updateField}
            setTemplate={setTemplate}
            url={qrUrl}
            tenantName={tenant.name}
            tenantSlug={tenant.slug}
            tableName={qrSubtitle}
            logoUrl={tenant.logoUrl}
          />
        </div>
      )}

      {/* ─── Step 2: Aperçu & Téléchargement ─── */}
      {currentStep === 2 && (
        <div>
          {/* Single QR Preview + Download */}
          <div className="bg-white rounded-xl border border-neutral-100 p-6 mb-6">
            <h3 className="text-base font-bold text-neutral-900 mb-4 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-neutral-400" />
              {t('yourQRCode')}
            </h3>
            <div className="flex justify-center mb-6">
              <div className="max-w-xs w-full">
                <QRPreview
                  ref={downloadPreviewRef}
                  config={config}
                  url={qrUrl}
                  tenantName={tenant.name}
                  tableName={qrSubtitle}
                  logoUrl={tenant.logoUrl}
                />
              </div>
            </div>
            <QRExportBar config={config} previewRef={downloadPreviewRef} tenantSlug={tenant.slug} />
          </div>

          {/* Batch Generation Section */}
          {tables.length > 0 && (
            <div className="bg-white rounded-xl border border-neutral-100 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                    <Download className="w-4 h-4 text-neutral-400" />
                    {t('batchGeneration')}
                  </h3>
                  <p className="text-sm text-neutral-500 mt-1">
                    {t('batchGenerationDesc', { count: tables.length })}
                  </p>
                </div>
              </div>

              <BatchQRPreview
                tables={tables}
                zones={zones}
                menus={menus}
                selectedMenuId={selectedMenuId}
                menuUrl={menuUrl}
                tenantName={tenant.name}
                primaryColor={tenant.primaryColor}
                config={config}
              />
            </div>
          )}

          {/* Tips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
              <h3 className="font-semibold text-neutral-900 mb-1">{t('tipStandard')}</h3>
              <p className="text-sm text-neutral-500">{t('tipStandardDesc')}</p>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
              <h3 className="font-semibold text-neutral-900 mb-1">{t('tipEasel')}</h3>
              <p className="text-sm text-neutral-500">{t('tipEaselDesc')}</p>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
              <h3 className="font-semibold text-neutral-900 mb-1">{t('tipCard')}</h3>
              <p className="text-sm text-neutral-500">{t('tipCardDesc')}</p>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
              <h3 className="font-semibold text-neutral-900 mb-1 flex items-center gap-2">
                {t('tipMinimal')}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#CCFF00] text-black text-[10px] font-bold uppercase tracking-wide">
                  <Sparkles className="w-3 h-3" />
                  Premium
                </span>
              </h3>
              <p className="text-sm text-neutral-500">{t('tipMinimalDesc')}</p>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
              <h3 className="font-semibold text-neutral-900 mb-1 flex items-center gap-2">
                {t('tipElegant')}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#CCFF00] text-black text-[10px] font-bold uppercase tracking-wide">
                  <Sparkles className="w-3 h-3" />
                  Premium
                </span>
              </h3>
              <p className="text-sm text-neutral-500">{t('tipElegantDesc')}</p>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
              <h3 className="font-semibold text-neutral-900 mb-1 flex items-center gap-2">
                {t('tipNeon')}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#CCFF00] text-black text-[10px] font-bold uppercase tracking-wide">
                  <Sparkles className="w-3 h-3" />
                  Premium
                </span>
              </h3>
              <p className="text-sm text-neutral-500">{t('tipNeonDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Navigation Buttons ─── */}
      <div className="mt-8 flex items-center justify-between">
        {currentStep > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => goToStep(currentStep - 1)}
            className="gap-2 text-neutral-600 hover:text-neutral-900"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('previous')}
          </Button>
        ) : (
          <div />
        )}

        {currentStep < 2 && (
          <Button
            type="button"
            variant="lime"
            onClick={() => goToStep(currentStep + 1)}
            className="gap-2 rounded-xl"
          >
            {t('next')}
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Batch QR Preview ──────────────────────────────────────
interface BatchQRPreviewProps {
  tables: Table[];
  zones: Zone[];
  menus: QRMenu[];
  selectedMenuId: string;
  menuUrl: string;
  tenantName: string;
  primaryColor: string;
  config: QRDesignConfig;
}

function BatchQRPreview({
  tables,
  zones,
  menus,
  selectedMenuId,
  menuUrl,
  tenantName,
  primaryColor,
  config,
}: BatchQRPreviewProps) {
  const t = useTranslations('qrCodes');
  const [generating, setGenerating] = useState(false);

  const selectedMenu = menus.find((m) => m.id === selectedMenuId);

  // Group tables by zone for display
  const groupedTables = useMemo(() => {
    const grouped: Record<string, { zoneName: string; tables: Table[] }> = {};
    for (const zone of zones) {
      grouped[zone.id] = { zoneName: zone.name, tables: [] };
    }
    for (const table of tables) {
      if (grouped[table.zone_id]) {
        grouped[table.zone_id].tables.push(table);
      }
    }
    return Object.values(grouped).filter((g) => g.tables.length > 0);
  }, [zones, tables]);

  const handleBatchDownload = async () => {
    setGenerating(true);
    try {
      // Dynamic import to avoid SSR issues
      const { default: jsPDF } = await import('jspdf');
      const { QRCodeSVG } = await import('qrcode.react');
      const { createRoot } = await import('react-dom/client');
      const { createElement } = await import('react');

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        if (i > 0) pdf.addPage();

        const tableUrl = buildQRUrl(menuUrl, table.display_name, selectedMenu?.slug);

        // Create a temp container to render QR code as SVG
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        document.body.appendChild(container);

        const root = createRoot(container);
        root.render(
          createElement(QRCodeSVG, {
            value: tableUrl,
            size: 600,
            level: config.errorCorrection,
            includeMargin: true,
            fgColor: config.qrFgColor,
            bgColor: config.qrBgColor,
          }),
        );

        // Wait for render
        await new Promise((resolve) => setTimeout(resolve, 100));

        const svg = container.querySelector('svg');
        if (svg) {
          const svgData = new XMLSerializer().serializeToString(svg);
          const canvas = document.createElement('canvas');
          canvas.width = 600;
          canvas.height = 600;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const img = new Image();
            const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);

            await new Promise<void>((resolve) => {
              img.onload = () => {
                ctx.fillStyle = config.qrBgColor;
                ctx.fillRect(0, 0, 600, 600);
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(blobUrl);
                resolve();
              };
              img.src = blobUrl;
            });

            const imgData = canvas.toDataURL('image/png');
            const qrSize = 80;
            const qrX = (pageWidth - qrSize) / 2;

            // Title
            pdf.setFontSize(24);
            pdf.setTextColor(primaryColor);
            pdf.text(tenantName, pageWidth / 2, 30, { align: 'center' });

            // Table name
            pdf.setFontSize(18);
            pdf.setTextColor('#374151');
            pdf.text(table.display_name, pageWidth / 2, 45, { align: 'center' });

            // QR Code
            pdf.addImage(imgData, 'PNG', qrX, 60, qrSize, qrSize);

            // CTA
            pdf.setFontSize(14);
            pdf.setTextColor('#6B7280');
            pdf.text(config.ctaText || 'Scannez pour commander', pageWidth / 2, 155, {
              align: 'center',
            });

            // URL (small)
            pdf.setFontSize(8);
            pdf.setTextColor('#9CA3AF');
            pdf.text(tableUrl, pageWidth / 2, pageHeight - 15, { align: 'center' });
          }
        }

        root.unmount();
        document.body.removeChild(container);
      }

      pdf.save(`qrcodes-${tenantName.toLowerCase().replace(/\s/g, '-')}-toutes-tables.pdf`);
    } catch (error) {
      logger.error('Batch PDF generation error', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      {/* Table list preview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-4">
        {groupedTables.map(({ zoneName, tables: zoneTables }) => (
          <div key={zoneName} className="contents">
            {zoneTables.map((table) => (
              <div
                key={table.id}
                className="flex items-center gap-2 p-2 bg-neutral-50 rounded-xl text-xs"
              >
                <Table2 className="w-3 h-3 text-neutral-400 shrink-0" />
                <span className="text-neutral-700 font-medium truncate">{table.display_name}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Download button */}
      <Button
        onClick={handleBatchDownload}
        disabled={generating}
        variant="lime"
        size="lg"
        className="w-full gap-2"
      >
        <Download className="w-4 h-4" />
        {generating
          ? t('batchGenerating', { count: tables.length })
          : t('batchDownload', { count: tables.length })}
      </Button>
      {selectedMenu && (
        <p className="text-xs text-neutral-400 mt-2 text-center">
          {t('batchMenuRedirect', { menu: selectedMenu.name })}
        </p>
      )}
    </div>
  );
}
