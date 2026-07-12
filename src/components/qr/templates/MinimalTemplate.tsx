'use client';

import type { QRTemplateProps } from '@/types/qr-design.types';
import { StyledQR } from '@/components/qr/StyledQR';

const MM = 3.78;

/**
 * Minimal - the QR alone with a whisper of type. White card, generous
 * whitespace, hairline divider. Linear-clean: no gradient, no shadow.
 */
export function MinimalTemplate({ config, url, tenantName, tableName }: QRTemplateProps) {
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
        border: '1px solid #ECECEC',
      }}
      className="flex flex-col items-center justify-center gap-6"
    >
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

      <div className="flex flex-col items-center gap-1">
        <p className="text-[13px] font-medium tracking-tight">{tenantName}</p>
        {tableName && <p className="text-[11px] opacity-60">{tableName}</p>}
        {config.ctaText && <p className="text-[11px] opacity-60">{config.ctaText}</p>}
        {config.showPoweredBy && <p className="text-[10px] opacity-40">Powered by Attabl</p>}
      </div>
    </div>
  );
}
