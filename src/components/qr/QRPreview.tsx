/* eslint-disable @next/next/no-img-element */
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
    <div className="bg-app-elevated rounded-2xl p-8 flex items-center justify-center min-h-[400px]">
      {/* Dot pattern background */}
      <div
        className="relative flex flex-col items-center justify-center gap-3 w-full h-full"
        style={{
          backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      >
        {/* Scaled template container - ref for html2canvas capture */}
        <div
          ref={ref}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center',
          }}
        >
          {config.qrUploadedDesignUrl ? (
            <div
              style={{
                width: `${config.templateWidth * 3.78}px`,
                height: `${config.templateHeight * 3.78}px`,
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <img
                src={config.qrUploadedDesignUrl}
                alt=""
                style={{
                  transform: `scale(${config.qrUploadScale ?? 1})`,
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
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
          )}
        </div>
        <p className="text-[10px] text-app-text-muted text-center break-all max-w-full px-2 font-mono">
          {url}
        </p>
      </div>
    </div>
  );
});
