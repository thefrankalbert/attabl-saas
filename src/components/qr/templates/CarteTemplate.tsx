'use client';

import { QRCodeCanvas } from 'qrcode.react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function CarteTemplate({ config, url, tenantName, tableName, isExport }: QRTemplateProps) {
  const isLandscape = config.templateWidth > config.templateHeight;
  const textScale = config.textScale ?? 1;
  const showName = config.showName !== false;
  const showCta = config.showCta !== false;

  const Info = (
    <div className="flex flex-col items-center text-center gap-2">
      {showName && (
        <h3
          className="font-bold"
          style={{ color: config.templateTextColor, fontSize: `${1 * textScale}rem` }}
        >
          {tenantName}
        </h3>
      )}
      {tableName ? (
        <div
          className="inline-block px-2.5 py-1 rounded-md text-xs font-bold"
          style={{
            backgroundColor: config.templateAccentColor,
            color: config.templateAccentTextColor ?? config.templateBgColor,
          }}
        >
          {tableName}
        </div>
      ) : (
        <p className="text-xs opacity-50" style={{ color: config.templateTextColor }}>
          Room Service
        </p>
      )}
      {showCta && (
        <div
          className="inline-block px-3 py-1.5 rounded-lg font-medium"
          style={{
            backgroundColor: config.templateAccentColor,
            color: config.templateAccentTextColor ?? config.templateBgColor,
            fontSize: `${0.75 * textScale}rem`,
          }}
        >
          {config.ctaText} &rarr;
        </div>
      )}
      {config.descriptionText && (
        <p
          className="text-center opacity-70"
          style={{ color: config.templateTextColor, fontSize: `${0.7 * textScale}rem` }}
        >
          {config.descriptionText}
        </p>
      )}
      {config.footerText && (
        <p className="text-[10px] opacity-50" style={{ color: config.templateTextColor }}>
          {config.footerText}
        </p>
      )}
    </div>
  );

  const QR = (
    <div className="p-2 bg-white rounded-xl shadow-inner shrink-0">
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

      {(() => {
        const qrPosition = config.qrPosition ?? 'center';
        if (isLandscape) {
          if (qrPosition === 'start') {
            return (
              <div className="relative z-10 flex items-center gap-5 w-full h-full">
                {QR}
                <div className="flex-1 flex items-center justify-center">{Info}</div>
              </div>
            );
          }
          if (qrPosition === 'center') {
            return (
              <div className="relative z-10 flex flex-col items-center justify-center gap-3 w-full h-full">
                {Info}
                {QR}
              </div>
            );
          }
          return (
            <div className="relative z-10 flex items-center gap-5 w-full h-full">
              <div className="flex-1 flex items-center justify-center">{Info}</div>
              {QR}
            </div>
          );
        }
        // Portrait
        if (qrPosition === 'start') {
          return (
            <div className="relative z-10 flex flex-col items-center justify-center gap-4 w-full h-full">
              {QR}
              {Info}
            </div>
          );
        }
        if (qrPosition === 'end') {
          return (
            <div className="relative z-10 flex flex-col items-center justify-center gap-4 w-full h-full">
              {Info}
              {QR}
            </div>
          );
        }
        // center: same as end for Carte (Info on top, QR below) since it has only 2 blocks
        return (
          <div className="relative z-10 flex flex-col items-center justify-center gap-4 w-full h-full">
            {Info}
            {QR}
          </div>
        );
      })()}

      {config.showPoweredBy && (
        <p
          className="absolute bottom-1 left-0 right-0 text-center text-[10px] opacity-30 z-10"
          style={{ color: config.templateTextColor }}
        >
          Powered by Attabl
        </p>
      )}
    </div>
  );
}
