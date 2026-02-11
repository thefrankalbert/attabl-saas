'use client';

import { useRef } from 'react';
import { QRCustomizerPanel } from '@/components/qr/QRCustomizerPanel';
import { QRPreview } from '@/components/qr/QRPreview';
import { QRExportBar } from '@/components/qr/QRExportBar';
import type { QRDesignConfig, QRTemplateId } from '@/types/qr-design.types';

// ─── Types ─────────────────────────────────────────────

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

// ─── Component ─────────────────────────────────────────

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
      {/* Main split panel */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Mobile: preview first */}
        <div className="block md:hidden">
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
        <div className="w-full md:w-[420px] md:shrink-0 md:max-h-[calc(100vh-200px)] md:overflow-y-auto">
          <QRCustomizerPanel
            config={config}
            updateField={updateField}
            setTemplate={setTemplate}
            tenantLogoUrl={logoUrl}
          />
        </div>

        {/* Right panel: preview (desktop only) */}
        <div className="hidden md:block flex-1 md:sticky md:top-24 self-start">
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
