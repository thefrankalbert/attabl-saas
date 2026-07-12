'use client';

import { useState, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useQRDesignConfig } from '@/hooks/useQRDesignConfig';
import { QRCustomizerLayout } from '@/components/qr/QRCustomizerLayout';
import { QRPreview } from '@/components/qr/QRPreview';
import { QRExportBar } from '@/components/qr/QRExportBar';
import { QrCode, Info, Table2, BookOpen, Layers, Download, MapPin } from 'lucide-react';
import { buildQRUrl } from '@/lib/qr/build-qr-url';
import { groupTablesByZone } from '@/lib/qr/group-tables';
import { BatchQRPreview, type QRMenu } from '@/components/qr/BatchQRPreview';
import { QRAssignmentPanel, type QRDesignSummary } from '@/components/qr/QRAssignmentPanel';
import { QRExportPanel } from '@/components/qr/QRExportPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Table, Zone } from '@/types/admin.types';

interface QRCodePageProps {
  tenant: {
    name: string;
    slug: string;
    logoUrl?: string;
    primaryColor: string;
  };
  menuUrl: string;
  zones: Zone[];
  tables: Table[];
  menus: QRMenu[];
  designs: QRDesignSummary[];
}

export function QRCodePage({ tenant, menuUrl, zones, tables, menus, designs }: QRCodePageProps) {
  const t = useTranslations('qrCodes');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedMenuId, setSelectedMenuId] = useState<string>('');
  const downloadPreviewRef = useRef<HTMLDivElement>(null);

  // QR Design Config (centralized state for customizer)
  const { config, updateField, setTemplate, hydrate } = useQRDesignConfig(tenant.primaryColor);
  // Which saved design is loaded in the editor (null = a new/unsaved design).
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);

  // Group tables by zone (shared util)
  const tablesByZone = useMemo(() => groupTablesByZone(zones, tables), [zones, tables]);

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
    <div className="flex flex-col h-full">
      {/* Title kept for screen readers only - the nav + tabs already say where
          you are, so we don't repeat a heading + subtitle on screen. */}
      <h1 className="sr-only">{t('title')}</h1>

      {/* --- Tabs Navigation --- */}
      <Tabs defaultValue="choose" className="flex flex-col flex-1 min-h-0">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="choose">{t('tabChoose')}</TabsTrigger>
          <TabsTrigger value="customize">{t('tabCustomize')}</TabsTrigger>
          <TabsTrigger value="assign">{t('tabAssign')}</TabsTrigger>
          <TabsTrigger value="download">{t('tabDownload')}</TabsTrigger>
        </TabsList>

        {/* --- Tab: Choose --- */}
        <TabsContent value="choose" className="flex-1 overflow-auto">
          <div>
            {/* Info Banner */}
            <div className="mb-6 p-4 rounded-xl bg-app-bg border border-app-border flex items-start gap-3">
              <Info className="h-5 w-5 text-app-text-muted flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-app-text-secondary">
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
                <p className="text-xs text-app-text-muted mt-1">{t('qrRedirectInfo')}</p>
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
                      <Label
                        htmlFor="qr-table-select"
                        className="flex items-center gap-1.5 text-xs font-medium text-app-text-secondary mb-1.5"
                      >
                        <Table2 className="w-3.5 h-3.5" />
                        {t('table')}
                      </Label>
                      <Select
                        value={selectedTableId || '__none__'}
                        onValueChange={(val) => setSelectedTableId(val === '__none__' ? '' : val)}
                      >
                        <SelectTrigger id="qr-table-select" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t('noTable')}</SelectItem>
                          {tablesByZone.map(({ zone, tables: zoneTables }) => (
                            <SelectGroup key={zone.id}>
                              <SelectLabel>{zone.name}</SelectLabel>
                              {zoneTables.map((table) => (
                                <SelectItem key={table.id} value={table.id}>
                                  {table.display_name}
                                  {table.capacity > 0
                                    ? ` (${t('seats', { count: table.capacity })})`
                                    : ''}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Menu Selector */}
                  {menus.length > 0 && (
                    <div>
                      <Label
                        htmlFor="qr-menu-select"
                        className="flex items-center gap-1.5 text-xs font-medium text-app-text-secondary mb-1.5"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        {t('menuLabel')}
                      </Label>
                      <Select
                        value={selectedMenuId || '__all__'}
                        onValueChange={(val) => setSelectedMenuId(val === '__all__' ? '' : val)}
                      >
                        <SelectTrigger id="qr-menu-select" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">{t('allMenus')}</SelectItem>
                          {menus.map((menu) => (
                            <SelectItem key={menu.id} value={menu.id}>
                              {menu.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

        {/* --- Tab: Customize --- */}
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

        {/* --- Tab: Assign (persisted per zone/table) --- */}
        <TabsContent value="assign" className="flex-1 overflow-auto">
          <div className="mb-4 p-4 rounded-xl bg-app-bg border border-app-border flex items-start gap-3">
            <MapPin className="h-5 w-5 text-app-text-muted flex-shrink-0 mt-0.5" />
            <p className="text-sm text-app-text-secondary">{t('assignIntro')}</p>
          </div>
          <QRAssignmentPanel
            zones={zones}
            tables={tables}
            designs={designs}
            currentConfig={config}
            currentDesignId={currentDesignId}
            onDesignIdChange={setCurrentDesignId}
            onLoadDesign={hydrate}
          />
        </TabsContent>

        {/* --- Tab: Download --- */}
        <TabsContent value="download" className="flex-1 overflow-auto">
          <div>
            {/* Format, dimensions & print layout (choose BEFORE printing) */}
            <div className="bg-app-card rounded-xl border border-app-border p-6 mb-6">
              <h3 className="text-base font-bold text-app-text mb-4 flex items-center gap-2">
                <Download className="w-4 h-4 text-app-text-muted" />
                {t('formatAndLayout')}
              </h3>
              <QRExportPanel
                config={config}
                updateField={updateField}
                url={qrUrl}
                tenantName={tenant.name}
                tableName={qrSubtitle}
                logoUrl={tenant.logoUrl}
              />
            </div>

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
                  config={config}
                />
              </div>
            )}

            {/* Tips - one per template */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-app-bg border border-app-border">
                <h3 className="font-semibold text-app-text mb-1">{t('tipMinimal')}</h3>
                <p className="text-sm text-app-text-secondary">{t('tipMinimalDesc')}</p>
              </div>
              <div className="p-4 rounded-xl bg-app-bg border border-app-border">
                <h3 className="font-semibold text-app-text mb-1">{t('tipCard')}</h3>
                <p className="text-sm text-app-text-secondary">{t('tipCardDesc')}</p>
              </div>
              <div className="p-4 rounded-xl bg-app-bg border border-app-border">
                <h3 className="font-semibold text-app-text mb-1">{t('tipEasel')}</h3>
                <p className="text-sm text-app-text-secondary">{t('tipEaselDesc')}</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
