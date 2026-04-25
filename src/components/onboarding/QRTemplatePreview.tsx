/* eslint-disable @next/next/no-img-element */
'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { TEMPLATE_REGISTRY } from '@/components/qr/templates';
import { TEMPLATE_DEFAULTS } from '@/types/qr-design.types';
import { onboardingDataToQRConfig } from '@/components/onboarding/utils/qr-config-bridge';
import { getTenantUrl } from '@/lib/constants';
import type { OnboardingData } from '@/app/onboarding/page';

interface QRTemplatePreviewProps {
  data: OnboardingData;
}

const MM_PER_PX = 3.78;
const MAX_PREVIEW_HEIGHT_PX = 420;
const MAX_PREVIEW_WIDTH_PX = 280;

/**
 * Live preview of the selected QR template rendered in the onboarding sidebar
 * (replaces PhonePreview during the QR/summary screens).
 *
 * Shows either:
 * - The current template with all customizations (colors, dimensions, text) applied in real-time
 * - The uploaded design (if qrUploadedDesignUrl is set), scaled to support dimensions
 */
export function QRTemplatePreview({ data }: QRTemplatePreviewProps) {
  const t = useTranslations('onboarding');

  const templateId = data.qrTemplate ?? 'standard';
  const config = useMemo(() => onboardingDataToQRConfig(data, templateId), [data, templateId]);
  const defaults = TEMPLATE_DEFAULTS[templateId];

  const widthMm = data.qrSupportWidth ?? defaults.width;
  const heightMm = data.qrSupportHeight ?? defaults.height;

  // Convert mm to px for preview, then scale to fit
  const widthPx = widthMm * MM_PER_PX;
  const heightPx = heightMm * MM_PER_PX;
  const scale = Math.min(MAX_PREVIEW_HEIGHT_PX / heightPx, MAX_PREVIEW_WIDTH_PX / widthPx, 1);

  const url = data.tenantSlug ? getTenantUrl(data.tenantSlug) : 'https://attabl.com';
  const tenantName = data.tenantName || 'Mon resto';
  const TemplateComponent = TEMPLATE_REGISTRY[templateId];

  const hasUpload = !!data.qrUploadedDesignUrl;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 py-8 gap-4">
      {/* Header */}
      <div className="text-center mb-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted">
          {t('qrPreviewLabel') || 'Aperçu en temps réel'}
        </p>
      </div>

      {/* Preview frame with dotted background */}
      <div
        className="relative flex items-center justify-center rounded-2xl overflow-hidden"
        style={{
          width: `${MAX_PREVIEW_WIDTH_PX + 32}px`,
          minHeight: `${MAX_PREVIEW_HEIGHT_PX}px`,
          backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
          backgroundSize: '12px 12px',
          backgroundColor: 'var(--app-elevated)',
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center',
          }}
        >
          {hasUpload ? (
            <div
              style={{
                width: `${widthPx}px`,
                height: `${heightPx}px`,
                background: '#fff',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <img
                src={data.qrUploadedDesignUrl}
                alt="Uploaded design"
                style={{
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
              logoUrl={data.logoUrl || undefined}
            />
          )}
        </div>
      </div>

      {/* Dimensions caption */}
      <div className="text-center">
        <p className="text-xs font-semibold text-app-text">
          {hasUpload
            ? t('qrUploadedDesign') || 'Design personnalisé'
            : t(`qrTemplate${templateId.charAt(0).toUpperCase()}${templateId.slice(1)}`) ||
              templateId}
        </p>
        <p className="text-[11px] text-app-text-muted mt-0.5 tabular-nums">
          {widthMm} × {heightMm} mm
          {data.qrOrientation === 'landscape' ? ' · Paysage' : ' · Portrait'}
        </p>
      </div>
    </div>
  );
}
