'use client';

import { QRCodeCanvas } from 'qrcode.react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function NeonTemplate({ config, url, tenantName, tableName, isExport }: QRTemplateProps) {
  const accentColor = config.templateAccentColor;
  const isLandscape = config.templateWidth > config.templateHeight;
  const textScale = config.textScale ?? 1;
  const showName = config.showName !== false;
  const showCta = config.showCta !== false;

  const NeonLine = (
    <div
      style={{
        width: '100%',
        height: '1px',
        backgroundColor: accentColor,
        boxShadow: `0 0 6px ${accentColor}, 0 0 12px ${accentColor}80`,
      }}
    />
  );

  const Texts = (
    <div className="flex flex-col items-center gap-3 w-full">
      {showName && (
        <h2
          className="font-bold uppercase tracking-widest text-center"
          style={{
            color: accentColor,
            fontSize: `${1.25 * textScale}rem`,
            textShadow: `0 0 10px ${accentColor}80, 0 0 20px ${accentColor}40`,
          }}
        >
          {tenantName}
        </h2>
      )}
      {NeonLine}
      {tableName && (
        <p
          className="font-semibold uppercase tracking-wider"
          style={{
            color: accentColor,
            fontSize: `${0.875 * textScale}rem`,
            textShadow: `0 0 8px ${accentColor}CC, 0 0 16px ${accentColor}66`,
          }}
        >
          {tableName}
        </p>
      )}
      {config.descriptionText && (
        <p
          className="text-center opacity-70"
          style={{
            color: accentColor,
            fontSize: `${0.75 * textScale}rem`,
            textShadow: `0 0 6px ${accentColor}60`,
          }}
        >
          {config.descriptionText}
        </p>
      )}
      {showCta && config.ctaText && (
        <p
          className="font-medium text-center"
          style={{
            color: accentColor,
            fontSize: `${0.875 * textScale}rem`,
            textShadow: `0 0 6px ${accentColor}80`,
          }}
        >
          {config.ctaText}
        </p>
      )}
      {NeonLine}
      {config.footerText && (
        <p
          className="text-center opacity-60"
          style={{ color: config.templateTextColor, fontSize: `${0.625 * textScale}rem` }}
        >
          {config.footerText}
        </p>
      )}
      {config.showPoweredBy && (
        <p
          className="text-center opacity-40"
          style={{ color: config.templateTextColor, fontSize: `${0.625 * textScale}rem` }}
        >
          Powered by Attabl
        </p>
      )}
    </div>
  );

  const QR = (
    <div className="shrink-0">
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
          <div className="flex-1 flex items-center justify-center">{Texts}</div>
          {QR}
        </div>
      ) : (
        <div className="relative z-10 flex flex-col items-center justify-center gap-4 w-full h-full">
          {Texts}
          {QR}
        </div>
      )}
    </div>
  );
}
