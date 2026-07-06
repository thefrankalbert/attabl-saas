'use client';

import type { QRTemplateProps } from '@/types/qr-design.types';
import { StyledQR } from '@/components/qr/StyledQR';

const MM = 3.78;

/**
 * Carte bordee - a framed card: restaurant name on top, a hairline rule, the
 * QR centered, CTA underneath. The tenant accent colors only the top name.
 */
export function CarteTemplate({ config, url, tenantName, tableName }: QRTemplateProps) {
  return (
    <div
      style={{
        width: `${config.templateWidth * MM}px`,
        height: `${config.templateHeight * MM}px`,
        borderRadius: `${config.cornerRadius}px`,
        padding: `${config.padding}px`,
        backgroundColor: config.templateBgColor,
        color: config.templateTextColor,
        fontFamily: config.fontFamily,
        border: '1px solid #E4E4E7',
      }}
      className="flex flex-col items-center"
    >
      <div className="w-full flex flex-col items-center gap-2">
        <p
          className="text-[15px] font-semibold tracking-tight"
          style={{ color: config.templateAccentColor }}
        >
          {tenantName}
        </p>
        <div className="w-full" style={{ height: '1px', backgroundColor: '#ECECEC' }} />
      </div>

      <div className="flex flex-1 items-center justify-center py-4">
        <StyledQR
          value={url}
          size={config.qrSize}
          fgColor={config.qrFgColor}
          bgColor={config.qrBgColor}
          dotStyle={config.qrDotStyle}
          cornerStyle={config.qrCornerStyle}
          errorCorrection={config.errorCorrection}
          logoSrc={config.logo.enabled ? config.logo.src : undefined}
          margin={config.marginSize}
        />
      </div>

      <div className="flex flex-col items-center gap-0.5">
        {config.ctaText && <p className="text-[12px] font-medium">{config.ctaText}</p>}
        {tableName && <p className="text-[11px] opacity-50">{tableName}</p>}
      </div>
    </div>
  );
}
