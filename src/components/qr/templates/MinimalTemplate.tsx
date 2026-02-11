'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function MinimalTemplate({ config, url, tenantName, tableName }: QRTemplateProps) {
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
      className={`flex flex-col items-center justify-center ${SHADOW_CLASSES[config.shadow]}`}
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

      {/* Content - ultra-clean, maximum whitespace */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-5">
        {/* Large QR code - no extra container, just the QR directly */}
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

        {/* Thin horizontal line */}
        <div
          className="opacity-30"
          style={{
            width: '60%',
            height: '1px',
            backgroundColor: config.templateAccentColor,
          }}
        />

        {/* Tenant name - very small, uppercase, letter-spacing-widest */}
        <p
          className="text-xs uppercase tracking-widest opacity-60"
          style={{ color: config.templateTextColor }}
        >
          {tenantName}
        </p>

        {/* Table name underneath if present */}
        {tableName && (
          <p
            className="text-xs font-normal -mt-3 opacity-50"
            style={{ color: config.templateTextColor }}
          >
            {tableName}
          </p>
        )}

        {/* CTA text in tiny italic */}
        {config.ctaText && (
          <p
            className="text-[10px] italic opacity-40 -mt-2"
            style={{ color: config.templateTextColor }}
          >
            {config.ctaText}
          </p>
        )}

        {/* Footer text */}
        {config.footerText && (
          <p
            className="text-[9px] text-center opacity-30 -mt-2"
            style={{ color: config.templateTextColor }}
          >
            {config.footerText}
          </p>
        )}

        {/* Powered by Attabl */}
        {config.showPoweredBy && (
          <p
            className="text-[8px] text-center opacity-25 -mt-2"
            style={{ color: config.templateTextColor }}
          >
            Powered by Attabl
          </p>
        )}
      </div>
    </div>
  );
}
