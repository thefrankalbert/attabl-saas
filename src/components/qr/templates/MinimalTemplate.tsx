'use client';

import { QRCodeCanvas } from 'qrcode.react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function MinimalTemplate({ config, url, tenantName, tableName, isExport }: QRTemplateProps) {
  const isLandscape = config.templateWidth > config.templateHeight;
  const textScale = config.textScale ?? 1;
  const showName = config.showName !== false;
  const showCta = config.showCta !== false;

  const QR = (
    <QRCodeCanvas
      value={url}
      size={config.qrSize}
      level={config.errorCorrection}
      fgColor={config.qrFgColor}
      bgColor={config.qrBgColor}
      marginSize={config.marginSize}
      imageSettings={
        config.logo.enabled
          ? {
              src: config.logo.src,
              width: config.logo.width,
              height: config.logo.height,
              excavate: config.logo.excavate,
              opacity: config.logo.opacity,
              crossOrigin: 'anonymous' as const,
            }
          : undefined
      }
    />
  );

  const Texts = (
    <div className="flex flex-col items-center gap-2">
      <div
        className="opacity-30"
        style={{ width: '60px', height: '1px', backgroundColor: config.templateAccentColor }}
      />
      {showName && (
        <p
          className="uppercase tracking-widest opacity-60"
          style={{ color: config.templateTextColor, fontSize: `${0.75 * textScale}rem` }}
        >
          {tenantName}
        </p>
      )}
      {tableName && (
        <p className="opacity-50" style={{ color: config.templateTextColor, fontSize: `${0.75 * textScale}rem` }}>
          {tableName}
        </p>
      )}
      {config.descriptionText && (
        <p
          className="italic text-center opacity-60"
          style={{ color: config.templateTextColor, fontSize: `${0.7 * textScale}rem` }}
        >
          {config.descriptionText}
        </p>
      )}
      {showCta && config.ctaText && (
        <p className="italic opacity-40" style={{ color: config.templateTextColor, fontSize: `${0.625 * textScale}rem` }}>
          {config.ctaText}
        </p>
      )}
      {config.footerText && (
        <p className="text-center opacity-30" style={{ color: config.templateTextColor, fontSize: `${0.625 * textScale}rem` }}>
          {config.footerText}
        </p>
      )}
      {config.showPoweredBy && (
        <p className="text-center opacity-25" style={{ color: config.templateTextColor, fontSize: `${0.625 * textScale}rem` }}>
          Powered by Attabl
        </p>
      )}
    </div>
  );

  return (
    <div
      style={{
        width: `${config.templateWidth * 3.78}px`,
        height: `${config.templateHeight * 3.78}px`,
        borderRadius: `${config.cornerRadius}px`,
        padding: `${config.padding}px`,
        backgroundColor: config.gradient.enabled ? undefined : config.templateBgColor,
        backgroundImage: config.gradient.enabled
          ? `linear-gradient(${config.gradient.angle}deg, ${config.gradient.colorStart}, ${config.gradient.colorEnd})`
          : config.backgroundImage.enabled && config.backgroundImage.src
            ? `url(${config.backgroundImage.src})`
            : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        fontFamily: config.fontFamily,
        position: 'relative',
        overflow: isExport ? 'visible' : 'hidden',
      }}
      className={`flex items-center justify-center ${SHADOW_CLASSES[config.shadow]}`}
    >
      {config.backgroundImage.enabled && config.backgroundImage.src && !config.gradient.enabled && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: config.templateBgColor,
            opacity: 1 - (config.backgroundImage.opacity ?? 0.5),
          }}
        />
      )}

      {isLandscape ? (
        <div className="relative z-10 flex items-center justify-center gap-6 w-full h-full">
          {QR}
          {Texts}
        </div>
      ) : (
        <div className="relative z-10 flex flex-col items-center justify-center gap-5 w-full h-full">
          {QR}
          {Texts}
        </div>
      )}
    </div>
  );
}
