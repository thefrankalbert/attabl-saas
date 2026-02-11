/* eslint-disable @next/next/no-img-element */
'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function ElegantTemplate({ config, url, tenantName, tableName, logoUrl }: QRTemplateProps) {
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

      {/* Double border effect using box-shadow */}
      <div
        className="relative z-10 flex flex-col items-center justify-center w-full h-full"
        style={{
          border: `2px solid ${config.templateAccentColor}`,
          boxShadow: `inset 0 0 0 6px ${config.templateBgColor}, inset 0 0 0 7px ${config.templateAccentColor}66`,
          borderRadius: `${Math.max(config.cornerRadius - 4, 0)}px`,
          padding: '16px',
        }}
      >
        {/* Top decorative line */}
        <div
          style={{
            width: '40px',
            height: '2px',
            backgroundColor: config.templateAccentColor,
            marginBottom: '16px',
          }}
        />

        {/* Logo or tenant name in larger font */}
        {logoUrl ? (
          <img src={logoUrl} alt={tenantName} className="h-10 w-auto object-contain mb-2" />
        ) : (
          <h2
            className="text-2xl font-bold mb-2 text-center"
            style={{ color: config.templateTextColor }}
          >
            {tenantName}
          </h2>
        )}

        {/* Italic description text */}
        {config.descriptionText && (
          <p
            className="text-xs italic text-center mb-3 opacity-70"
            style={{ color: config.templateTextColor }}
          >
            {config.descriptionText}
          </p>
        )}

        {/* Table name in elegant badge */}
        {tableName && (
          <div
            className="mb-4 px-5 py-1.5 text-sm font-semibold text-center"
            style={{
              border: `1px solid ${config.templateAccentColor}`,
              borderRadius: '4px',
              color: config.templateAccentColor,
            }}
          >
            {tableName}
          </div>
        )}

        {/* QR code in subtle container */}
        <div
          className="p-3 rounded-lg mb-4"
          style={{
            backgroundColor: `${config.templateAccentColor}0A`,
            border: `1px solid ${config.templateAccentColor}20`,
          }}
        >
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

        {/* CTA in italic style */}
        <p className="text-sm italic text-center mb-3" style={{ color: config.templateTextColor }}>
          {config.ctaText}
        </p>

        {/* Bottom decorative line */}
        <div
          style={{
            width: '40px',
            height: '2px',
            backgroundColor: config.templateAccentColor,
          }}
        />

        {/* Footer text */}
        {config.footerText && (
          <p
            className="mt-3 text-[10px] text-center opacity-50"
            style={{ color: config.templateTextColor }}
          >
            {config.footerText}
          </p>
        )}

        {/* Powered by Attabl */}
        {config.showPoweredBy && (
          <p
            className="mt-1 text-[8px] text-center opacity-30"
            style={{ color: config.templateTextColor }}
          >
            Powered by Attabl
          </p>
        )}
      </div>
    </div>
  );
}
