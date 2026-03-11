'use client';

import { useState, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useQRDesignConfig } from '@/hooks/useQRDesignConfig';
import { QRCustomizerLayout } from '@/components/qr/QRCustomizerLayout';
import { QRPreview } from '@/components/qr/QRPreview';
import { QRExportBar } from '@/components/qr/QRExportBar';
import { QrCode, Info, Table2, BookOpen, Layers, Download, Sparkles } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
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
  // When a specific menu is selected, link to /menu which handles the ?menu= param.
  // The root page (/) is the home/landing for the tenant; /menu shows the full menu detail.
  const path = menuSlug ? '/menu' : '';
  const url = new URL(`${baseUrl}${path}`);
  if (tableName) url.searchParams.set('table', tableName);
  if (menuSlug) url.searchParams.set('menu', menuSlug);
  return url.toString();
}

export function QRCodePage({ tenant, menuUrl, zones, tables, menus }: QRCodePageProps) {
  const t = useTranslations('qrCodes');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedMenuId, setSelectedMenuId] = useState<string>('');
  const downloadPreviewRef = useRef<HTMLDivElement>(null);

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
  const selectedTable = tables.find((tbl) => tbl.id === selectedTableId);
  const selectedMenu = menus.find((m) => m.id === selectedMenuId);

  // Build dynamic QR URL
  const qrUrl = buildQRUrl(
    menuUrl,
    selectedTable?.table_number || undefined,
    selectedMenu?.slug || undefined,
  );

  // Subtitle for the QR code (display_name for human readability)
  const qrSubtitle = selectedTable
    ? selectedTable.display_name || selectedTable.table_number
    : undefined;

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-4.5rem)]">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-app-elevated rounded-xl">
            <QrCode className="h-5 w-5 text-app-text-secondary" />
          </div>
          <h1 className="text-xl font-bold text-app-text">{t('title')}</h1>
        </div>
        <p className="text-sm text-app-text-secondary">{t('subtitle')}</p>
      </div>

      {/* ─── Tabs Navigation ─── */}
      <Tabs defaultValue="choose" className="flex flex-col flex-1 min-h-0">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="choose">{t('tabChoose')}</TabsTrigger>
          <TabsTrigger value="customize">{t('tabCustomize')}</TabsTrigger>
          <TabsTrigger value="download">{t('tabDownload')}</TabsTrigger>
        </TabsList>

        {/* ─── Tab: Choose ─── */}
        <TabsContent value="choose" className="flex-1 overflow-auto">
          <div>
            {/* Info Banner */}
            <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
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
              <div className="bg-app-card rounded-xl border border-app-border p-5">
                <h3 className="text-sm font-semibold text-app-text-secondary mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-app-text-muted" />
                  {t('selectTableMenu')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Table Selector */}
                  {tables.length > 0 && (
                    <div>
                      <label
                        htmlFor="qr-table-select"
                        className="flex items-center gap-1.5 text-xs font-medium text-app-text-secondary mb-1.5"
                      >
                        <Table2 className="w-3.5 h-3.5" />
                        {t('table')}
                      </label>
                      <select
                        id="qr-table-select"
                        value={selectedTableId}
                        onChange={(e) => setSelectedTableId(e.target.value)}
                        className="w-full px-3 py-2 border border-app-border rounded-xl text-sm focus:ring-2 focus:ring-accent/10 focus:border-app-border-hover transition-all"
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
                        className="flex items-center gap-1.5 text-xs font-medium text-app-text-secondary mb-1.5"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        {t('menuLabel')}
                      </label>
                      <select
                        id="qr-menu-select"
                        value={selectedMenuId}
                        onChange={(e) => setSelectedMenuId(e.target.value)}
                        className="w-full px-3 py-2 border border-app-border rounded-xl text-sm focus:ring-2 focus:ring-accent/10 focus:border-app-border-hover transition-all"
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
                  <div className="mt-3 p-2.5 bg-app-bg rounded-xl">
                    <p className="text-xs text-app-text-secondary font-mono break-all">{qrUrl}</p>
                  </div>
                )}
              </div>
            )}

            {/* Selection Summary */}
            <div className="mt-4 p-4 rounded-xl bg-app-bg border border-app-border">
              <h4 className="text-xs font-semibold text-app-text-secondary uppercase tracking-wide mb-2">
                {t('selectionSummary')}
              </h4>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5 text-sm text-app-text-secondary">
                  <Table2 className="w-3.5 h-3.5 text-app-text-muted" />
                  <span>{selectedTable ? selectedTable.display_name : t('noTableSelected')}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-app-text-secondary">
                  <BookOpen className="w-3.5 h-3.5 text-app-text-muted" />
                  <span>{selectedMenu ? selectedMenu.name : t('allMenus')}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ─── Tab: Customize ─── */}
        <TabsContent value="customize" className="flex-1 overflow-auto">
          <div className="bg-app-card rounded-xl border border-app-border p-6">
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
        </TabsContent>

        {/* ─── Tab: Download ─── */}
        <TabsContent value="download" className="flex-1 overflow-auto">
          <div>
            {/* Single QR Preview + Download */}
            <div className="bg-app-card rounded-xl border border-app-border p-6 mb-6">
              <h3 className="text-base font-bold text-app-text mb-4 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-app-text-muted" />
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
              <QRExportBar
                config={config}
                previewRef={downloadPreviewRef}
                tenantSlug={tenant.slug}
              />
            </div>

            {/* Batch Generation Section (A4 format) */}
            {tables.length > 0 && (
              <div className="bg-app-card rounded-xl border border-app-border p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-app-text flex items-center gap-2">
                      <Download className="w-4 h-4 text-app-text-muted" />
                      {t('batchGeneration')}
                    </h3>
                    <p className="text-sm text-app-text-secondary mt-1">
                      {t('batchGenerationDesc', { count: tables.length })}
                    </p>
                    <p className="text-xs text-app-text-muted mt-1">{t('formatA4')}</p>
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
              <div className="p-4 rounded-xl bg-app-bg border border-app-border">
                <h3 className="font-semibold text-app-text mb-1">{t('tipStandard')}</h3>
                <p className="text-sm text-app-text-secondary">{t('tipStandardDesc')}</p>
              </div>
              <div className="p-4 rounded-xl bg-app-bg border border-app-border">
                <h3 className="font-semibold text-app-text mb-1">{t('tipEasel')}</h3>
                <p className="text-sm text-app-text-secondary">{t('tipEaselDesc')}</p>
              </div>
              <div className="p-4 rounded-xl bg-app-bg border border-app-border">
                <h3 className="font-semibold text-app-text mb-1">{t('tipCard')}</h3>
                <p className="text-sm text-app-text-secondary">{t('tipCardDesc')}</p>
              </div>
              <div className="p-4 rounded-xl bg-app-bg border border-app-border">
                <h3 className="font-semibold text-app-text mb-1 flex items-center gap-2">
                  {t('tipMinimal')}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-accent-text text-[10px] font-bold uppercase tracking-wide">
                    <Sparkles className="w-3 h-3" />
                    Premium
                  </span>
                </h3>
                <p className="text-sm text-app-text-secondary">{t('tipMinimalDesc')}</p>
              </div>
              <div className="p-4 rounded-xl bg-app-bg border border-app-border">
                <h3 className="font-semibold text-app-text mb-1 flex items-center gap-2">
                  {t('tipElegant')}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-accent-text text-[10px] font-bold uppercase tracking-wide">
                    <Sparkles className="w-3 h-3" />
                    Premium
                  </span>
                </h3>
                <p className="text-sm text-app-text-secondary">{t('tipElegantDesc')}</p>
              </div>
              <div className="p-4 rounded-xl bg-app-bg border border-app-border">
                <h3 className="font-semibold text-app-text mb-1 flex items-center gap-2">
                  {t('tipNeon')}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-accent-text text-[10px] font-bold uppercase tracking-wide">
                    <Sparkles className="w-3 h-3" />
                    Premium
                  </span>
                </h3>
                <p className="text-sm text-app-text-secondary">{t('tipNeonDesc')}</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
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

        // Wait for React to render the SVG — poll until it appears (max 2s)
        let svg: SVGElement | null = null;
        for (let attempt = 0; attempt < 40; attempt++) {
          svg = container.querySelector('svg');
          if (svg) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
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
                className="flex items-center gap-2 p-2 bg-app-bg rounded-xl text-xs"
              >
                <Table2 className="w-3 h-3 text-app-text-muted shrink-0" />
                <span className="text-app-text-secondary font-medium truncate">
                  {table.display_name}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Download button */}
      <Button
        onClick={handleBatchDownload}
        disabled={generating}
        variant="default"
        size="lg"
        className="w-full gap-2"
      >
        <Download className="w-4 h-4" />
        {generating
          ? t('batchGenerating', { count: tables.length })
          : t('batchDownload', { count: tables.length })}
      </Button>
      {selectedMenu && (
        <p className="text-xs text-app-text-muted mt-2 text-center">
          {t('batchMenuRedirect', { menu: selectedMenu.name })}
        </p>
      )}
    </div>
  );
}
