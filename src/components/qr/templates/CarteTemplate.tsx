'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function CarteTemplate({ config, url, tenantName, tableName }: QRTemplateProps) {
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
        overflow: 'hidden',
      }}
      className={`flex items-center gap-5 ${SHADOW_CLASSES[config.shadow]}`}
    >
      {/* Background image overlay */}
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

      {/* Left side: Info */}
      <div className="relative z-10 flex-1">
        <h3 className="text-base font-bold mb-1" style={{ color: config.templateTextColor }}>
          {tenantName}
        </h3>

        {tableName ? (
          <div
            className="inline-block px-2.5 py-1 rounded-md text-xs font-bold mb-3"
            style={{
              backgroundColor: config.templateAccentColor,
              color: config.templateBgColor,
            }}
          >
            {tableName}
          </div>
        ) : (
          <p className="text-xs mb-3 opacity-50" style={{ color: config.templateTextColor }}>
            Room Service
          </p>
        )}

        {/* CTA button with arrow */}
        <div
          className="inline-block px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            backgroundColor: config.templateAccentColor,
            color: config.templateBgColor,
          }}
        >
          {config.ctaText} &rarr;
        </div>

        {/* Footer text */}
        {config.footerText && (
          <p className="mt-2 text-[9px] opacity-50" style={{ color: config.templateTextColor }}>
            {config.footerText}
          </p>
        )}
      </div>

      {/* Right side: QR code */}
      <div className="relative z-10 p-2 bg-white rounded-xl shadow-inner">
        <QRCodeSVG
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

      {/* Powered by Attabl */}
      {config.showPoweredBy && (
        <p
          className="absolute bottom-1 left-0 right-0 text-center text-[8px] opacity-30 z-10"
          style={{ color: config.templateTextColor }}
        >
          Powered by Attabl
        </p>
      )}
    </div>
  );
}
