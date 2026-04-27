'use client';

import { QRCodeCanvas } from 'qrcode.react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function ElegantTemplate({
  config,
  url,
  tenantName,
  tableName,
  isExport,
}: QRTemplateProps) {
  const isLandscape = config.templateWidth > config.templateHeight;
  const textScale = config.textScale ?? 1;
  const showCta = config.showCta !== false;

  const Decoration = (
    <div
      style={{
        width: '40px',
        height: '2px',
        backgroundColor: config.templateAccentColor,
      }}
    />
  );

  const Header = (
    <div className="flex flex-col items-center gap-2">
      {Decoration}
      <h2
        className="font-bold text-center"
        style={{ color: config.templateTextColor, fontSize: `${1.5 * textScale}rem` }}
      >
        {tenantName}
      </h2>
      {config.descriptionText && (
        <p
          className="italic text-center opacity-70"
          style={{ color: config.templateTextColor, fontSize: `${0.75 * textScale}rem` }}
        >
          {config.descriptionText}
        </p>
      )}
      {tableName && (
        <div
          className="px-5 py-1.5 text-sm font-semibold text-center"
          style={{
            border: `1px solid ${config.templateAccentColor}`,
            borderRadius: '4px',
            color: config.templateAccentColor,
          }}
        >
          {tableName}
        </div>
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

  const Footer = (
    <div className="flex flex-col items-center gap-2">
      {showCta && config.ctaText && (
        <p
          className="italic text-center"
          style={{ color: config.templateTextColor, fontSize: `${0.875 * textScale}rem` }}
        >
          {config.ctaText}
        </p>
      )}
      {Decoration}
      {config.footerText && (
        <p className="text-center opacity-50" style={{ color: config.templateTextColor, fontSize: `${0.625 * textScale}rem` }}>
          {config.footerText}
        </p>
      )}
      {config.showPoweredBy && (
        <p
          className="text-[10px] text-center opacity-30"
          style={{ color: config.templateTextColor }}
        >
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

      <div
        className="relative z-10 flex items-center justify-center w-full h-full"
        style={{
          border: `2px solid ${config.templateAccentColor}`,
          boxShadow: `inset 0 0 0 6px ${config.templateBgColor}, inset 0 0 0 7px ${config.templateAccentColor}66`,
          borderRadius: `${Math.max(config.cornerRadius - 4, 0)}px`,
          padding: '16px',
        }}
      >
        {isLandscape ? (
          <div className="flex items-center justify-center gap-6 w-full h-full">
            <div className="flex flex-col items-center justify-center gap-3 flex-1">
              {Header}
              {Footer}
            </div>
            {QR}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 w-full h-full">
            {Header}
            {QR}
            {Footer}
          </div>
        )}
      </div>
    </div>
  );
}
