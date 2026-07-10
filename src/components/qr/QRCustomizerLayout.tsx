'use client';

import { useRef } from 'react';
import { QRCustomizerPanel } from '@/components/qr/QRCustomizerPanel';
import { QRPreview } from '@/components/qr/QRPreview';
import { QRExportBar } from '@/components/qr/QRExportBar';
import type { QRDesignConfig, QRTemplateId } from '@/types/qr-design.types';

// --- Types ---------------------------------------------

interface QRCustomizerLayoutProps {
  config: QRDesignConfig;
  updateField: <K extends keyof QRDesignConfig>(key: K, value: QRDesignConfig[K]) => void;
  setTemplate: (templateId: QRTemplateId) => void;
  url: string;
  tenantName: string;
  tenantSlug: string;
  tableName?: string;
  logoUrl?: string;
}

// --- Component -----------------------------------------

export function QRCustomizerLayout({
  config,
  updateField,
  setTemplate,
  url,
  tenantName,
  tenantSlug,
  tableName,
  logoUrl,
}: QRCustomizerLayoutProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col">
      {/* Main split panel. Split side-by-side only at xl - the fixed 384px
          control column + preview needs ~880px, which a tablet's content area
          (viewport minus sidebar) cannot hold; below xl it would overflow the
          `overflow-auto` tab and clip the controls' left edge on iPad. Stacks
          on tablet/mobile instead. */}
      <div className="flex flex-col xl:flex-row gap-6">
        {/* Tablet/mobile: preview first (stacked) */}
        <div className="block xl:hidden">
          <div className="max-h-[300px] overflow-hidden rounded-2xl">
            <QRPreview
              ref={previewRef}
              config={config}
              url={url}
              tenantName={tenantName}
              tableName={tableName}
              logoUrl={logoUrl}
            />
          </div>
        </div>

        {/* Left panel: customizer controls */}
        <div className="w-full xl:w-96 xl:shrink-0 xl:max-h-[calc(100dvh-200px)] xl:overflow-y-auto">
          <QRCustomizerPanel config={config} updateField={updateField} setTemplate={setTemplate} />
        </div>

        {/* Right panel: preview (desktop only) */}
        <div className="hidden xl:block flex-1 xl:sticky xl:top-24 self-start">
          <QRPreview
            ref={previewRef}
            config={config}
            url={url}
            tenantName={tenantName}
            tableName={tableName}
            logoUrl={logoUrl}
          />
        </div>
      </div>

      {/* Export bar at bottom */}
      <QRExportBar config={config} previewRef={previewRef} tenantSlug={tenantSlug} />
    </div>
  );
}
