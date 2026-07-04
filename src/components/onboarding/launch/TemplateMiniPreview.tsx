'use client';

import { useMemo } from 'react';
import { TEMPLATE_REGISTRY } from '@/components/qr/templates';
import type { QRTemplateId } from '@/types/qr-design.types';
import { TEMPLATE_DEFAULTS } from '@/types/qr-design.types';
import { onboardingDataToQRConfig } from '@/components/onboarding/utils/qr-config-bridge';
import type { OnboardingData } from '@/app/onboarding/page';

/** Renders a real template at mini scale for the template picker */
export function TemplateMiniPreview({
  templateId,
  data,
}: {
  templateId: QRTemplateId;
  data: OnboardingData;
}) {
  const config = useMemo(() => onboardingDataToQRConfig(data, templateId), [data, templateId]);

  const TemplateComponent = TEMPLATE_REGISTRY[templateId];
  const defaults = TEMPLATE_DEFAULTS[templateId];

  const templateHeightPx = defaults.height * 3.78;
  const templateWidthPx = defaults.width * 3.78;
  const scale = Math.min(70 / templateHeightPx, 100 / templateWidthPx, 0.18);

  return (
    <div
      className="relative overflow-hidden flex items-start justify-center"
      style={{
        height: 72,
        width: '100%',
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        <TemplateComponent
          config={config}
          url="https://attabl.com"
          tenantName={data.tenantName || 'Mon resto'}
          logoUrl={data.logoUrl || undefined}
        />
      </div>
    </div>
  );
}
