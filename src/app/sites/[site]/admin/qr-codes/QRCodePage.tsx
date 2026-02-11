'use client';

import { useState, useMemo } from 'react';
import { useQRDesignConfig } from '@/hooks/useQRDesignConfig';
import { QRCustomizerLayout } from '@/components/qr/QRCustomizerLayout';
import { QrCode, Info, Table2, BookOpen, Layers, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedMenuId, setSelectedMenuId] = useState<string>('');

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

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gray-100 rounded-xl">
            <QrCode className="h-6 w-6 text-gray-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">QR Codes</h1>
        </div>
        <p className="text-gray-500">
          Générez et imprimez des QR codes pour vos tables et supports.
        </p>
      </div>

      {/* Info Banner */}
      <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-blue-800">
            <strong>URL de votre menu :</strong>{' '}
            <a
              href={menuUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              {menuUrl}
            </a>
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Les clients qui scannent le QR code seront redirigés vers cette URL.
          </p>
        </div>
      </div>

      {/* Table & Menu Selectors */}
      {(tables.length > 0 || menus.length > 0) && (
        <div className="mb-6 bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-gray-400" />
            Personnaliser le QR Code
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Table Selector */}
            {tables.length > 0 && (
              <div>
                <label
                  htmlFor="qr-table-select"
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5"
                >
                  <Table2 className="w-3.5 h-3.5" />
                  Table
                </label>
                <select
                  id="qr-table-select"
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
                >
                  <option value="">Aucune table (QR générique)</option>
                  {tablesByZone.map(({ zone, tables: zoneTables }) => (
                    <optgroup key={zone.id} label={zone.name}>
                      {zoneTables.map((table) => (
                        <option key={table.id} value={table.id}>
                          {table.display_name}
                          {table.capacity > 0 ? ` (${table.capacity} places)` : ''}
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
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Carte / Menu
                </label>
                <select
                  id="qr-menu-select"
                  value={selectedMenuId}
                  onChange={(e) => setSelectedMenuId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all"
                >
                  <option value="">Toutes les cartes</option>
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
            <div className="mt-3 p-2.5 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 font-mono break-all">{qrUrl}</p>
            </div>
          )}
        </div>
      )}

      {/* QR Customizer — split panel layout */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
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

      {/* Batch Generation Section */}
      {tables.length > 0 && (
        <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Download className="w-4 h-4 text-gray-400" />
                Génération par lot
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Générez un QR code pour chaque table — {tables.length} table
                {tables.length > 1 ? 's' : ''} trouvée{tables.length > 1 ? 's' : ''}
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
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-1">Standard</h3>
          <p className="text-sm text-gray-500">
            Format carré 10×10 cm, idéal pour les affichages muraux et comptoirs.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-1">Chevalet</h3>
          <p className="text-sm text-gray-500">
            Format A6 vertical, parfait pour les chevalets de table.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-1">Carte</h3>
          <p className="text-sm text-gray-500">
            Format carte de visite, idéal pour le room service hôtelier.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
          <h3 className="font-semibold text-gray-900 mb-1">Minimal ⭐</h3>
          <p className="text-sm text-gray-500">
            Ultra-clean, grand QR avec une fine ligne séparatrice.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
          <h3 className="font-semibold text-gray-900 mb-1">Élégant ⭐</h3>
          <p className="text-sm text-gray-500">Bordure ornementale double, style serif raffiné.</p>
        </div>
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
          <h3 className="font-semibold text-gray-900 mb-1">Néon ⭐</h3>
          <p className="text-sm text-gray-500">
            Fond sombre avec accent vif et effet glow lumineux.
          </p>
        </div>
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
      console.error('Batch PDF generation error:', error);
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
                className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-xs"
              >
                <Table2 className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="text-gray-700 font-medium truncate">{table.display_name}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Download button */}
      <Button
        onClick={handleBatchDownload}
        disabled={generating}
        className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white rounded-xl gap-2"
      >
        <Download className="w-4 h-4" />
        {generating
          ? `Génération en cours (${tables.length} QR codes)...`
          : `Télécharger ${tables.length} QR code${tables.length > 1 ? 's' : ''} (PDF)`}
      </Button>
      {selectedMenu && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Chaque QR redirige vers la carte « {selectedMenu.name} »
        </p>
      )}
    </div>
  );
}
