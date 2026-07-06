'use client';

import { forwardRef, useMemo } from 'react';
import type { QRDesignConfig } from '@/types/qr-design.types';
import { TEMPLATE_REGISTRY } from '@/components/qr/templates';

// --- Types ---------------------------------------------

interface QRPreviewProps {
  config: QRDesignConfig;
  url: string;
  tenantName: string;
  tableName?: string;
  logoUrl?: string;
}

// --- Fit scale -----------------------------------------

const MM_TO_PX = 3.78;
const PREVIEW_BOX = 340; // px - the card is scaled to fit this box either way

function fitScale(widthMm: number, heightMm: number): number {
  const wpx = widthMm * MM_TO_PX;
  const hpx = heightMm * MM_TO_PX;
  return Math.min(PREVIEW_BOX / wpx, PREVIEW_BOX / hpx, 1);
}

// --- Component -----------------------------------------

export const QRPreview = forwardRef<HTMLDivElement, QRPreviewProps>(function QRPreview(
  { config, url, tenantName, tableName, logoUrl },
  ref,
) {
  const TemplateComponent = TEMPLATE_REGISTRY[config.templateId];

  const scale = useMemo(
    () => fitScale(config.templateWidth, config.templateHeight),
    [config.templateWidth, config.templateHeight],
  );

  return (
    <div className="bg-app-bg border border-app-border rounded-xl p-8 flex items-center justify-center min-h-[400px]">
      <div className="relative flex items-center justify-center w-full h-full">
        {/* Scaled template container - ref for html2canvas capture */}
        <div
          ref={ref}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center',
          }}
        >
          <TemplateComponent
            config={config}
            url={url}
            tenantName={tenantName}
            tableName={tableName}
            logoUrl={logoUrl}
          />
        </div>
      </div>
    </div>
  );
});
