'use client';

import type { QRTemplateProps } from '@/types/qr-design.types';
import { StyledQR } from '@/components/qr/StyledQR';

const MM = 3.78;

/**
 * Chevalet - A6 portrait table tent. Restaurant name at the top, generous
 * whitespace, QR centered, CTA at the base. Clean white with a hairline frame.
 */
export function ChevaletTemplate({ config, url, tenantName, tableName }: QRTemplateProps) {
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
      className="flex flex-col items-center justify-between"
    >
      <div className="flex w-full min-w-0 flex-col items-center gap-1 pt-2">
        <p
          className="w-full break-words text-center text-[17px] font-semibold tracking-tight line-clamp-2"
          style={{ color: config.templateAccentColor }}
        >
          {tenantName}
        </p>
        {tableName && (
          <p className="w-full truncate text-center text-[12px] opacity-50">{tableName}</p>
        )}
      </div>

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

      <div className="flex w-full min-w-0 flex-col items-center gap-0.5 pb-2">
        {config.ctaText && (
          <p className="w-full break-words text-center text-[13px] font-medium line-clamp-2">
            {config.ctaText}
          </p>
        )}
        {config.showPoweredBy && <p className="text-[10px] opacity-40">Powered by Attabl</p>}
      </div>
    </div>
  );
}
