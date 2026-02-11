'use client';

import { forwardRef, useMemo } from 'react';
import type { QRDesignConfig } from '@/types/qr-design.types';
import { TEMPLATE_REGISTRY } from '@/components/qr/templates';

// ─── Types ─────────────────────────────────────────────

interface QRPreviewProps {
  config: QRDesignConfig;
  url: string;
  tenantName: string;
  tableName?: string;
  logoUrl?: string;
}

// ─── Scale Map ─────────────────────────────────────────

const SCALE_MAP: Record<string, number> = {
  standard: 0.7,
  chevalet: 0.65,
  carte: 0.9,
  minimal: 0.7,
  elegant: 0.65,
  neon: 0.68,
};

// ─── Component ─────────────────────────────────────────

export const QRPreview = forwardRef<HTMLDivElement, QRPreviewProps>(function QRPreview(
  { config, url, tenantName, tableName, logoUrl },
  ref,
) {
  const TemplateComponent = TEMPLATE_REGISTRY[config.templateId];

  const scale = useMemo(() => SCALE_MAP[config.templateId] ?? 0.7, [config.templateId]);

  return (
    <div
      className="bg-gray-100 rounded-2xl p-8 flex items-center justify-center"
      style={{ minHeight: 400 }}
    >
      {/* Dot pattern background */}
      <div
        className="relative flex items-center justify-center w-full h-full"
        style={{
          backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      >
        {/* Scaled template container — ref for html2canvas capture */}
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
