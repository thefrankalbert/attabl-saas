'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Table2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildQRUrl } from '@/lib/qr/build-qr-url';
import { actionResolveDesignsForTables } from '@/app/actions/qr-design';
import { exportResolvedCardsToPdf, type ExportCard } from '@/lib/qr/export-card';
import { groupTablesByZone } from '@/lib/qr/group-tables';
import { logger } from '@/lib/logger';
import type { Table, Zone } from '@/types/admin.types';
import type { QRDesignConfig } from '@/types/qr-design.types';

export interface QRMenu {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

interface BatchQRPreviewProps {
  tables: Table[];
  zones: Zone[];
  menus: QRMenu[];
  selectedMenuId: string;
  menuUrl: string;
  tenantName: string;
  config: QRDesignConfig;
}

/**
 * "Download all tables" batch export: lists tables grouped by zone and generates
 * one styled card per table, each with its resolved (table -> zone -> default)
 * design. Extracted from QRCodePage to keep that file under the 400-line limit.
 */
export function BatchQRPreview({
  tables,
  zones,
  menus,
  selectedMenuId,
  menuUrl,
  tenantName,
  config,
}: BatchQRPreviewProps) {
  const t = useTranslations('qrCodes');
  const [generating, setGenerating] = useState(false);

  const selectedMenu = menus.find((m) => m.id === selectedMenuId);

  // Group tables by zone for display (shared util, also used by the assign panel)
  const groupedTables = useMemo(() => groupTablesByZone(zones, tables), [zones, tables]);

  const handleBatchDownload = async () => {
    setGenerating(true);
    try {
      // Resolve each table's assigned design (table -> zone -> tenant default) so
      // every printed card reflects what was assigned, not one global config.
      const resolved = await actionResolveDesignsForTables(tables.map((tbl) => tbl.id));
      if (!resolved.success) {
        toast.error(resolved.error);
        return;
      }

      const cards: ExportCard[] = tables.map((table) => ({
        // Canonical table_number in the URL (matches the single-QR path + scanner).
        url: buildQRUrl(menuUrl, table.table_number ?? undefined, selectedMenu?.slug),
        tableName: table.display_name,
        config: resolved.data[table.id] ?? config,
        tenantName,
      }));

      const { skipped } = await exportResolvedCardsToPdf(
        cards,
        `qrcodes-${tenantName.toLowerCase().replace(/\s/g, '-')}-toutes-tables.pdf`,
      );

      if (skipped.length > 0) {
        toast.warning(t('batchSkipped', { count: skipped.length }));
      } else {
        toast.success(t('exportDone'));
      }
    } catch (error) {
      logger.error('Batch PDF generation error', error);
      toast.error(t('exportError'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      {/* Table list preview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-4">
        {groupedTables.map(({ zone, tables: zoneTables }) => (
          <div key={zone.id} className="contents">
            {zoneTables.map((table) => (
              <div
                key={table.id}
                className="flex items-center gap-2 p-2 bg-app-bg rounded-xl text-xs"
              >
                <Table2 className="w-3 h-3 text-app-text-muted shrink-0" />
                <span className="text-app-text-secondary font-medium break-words">
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
