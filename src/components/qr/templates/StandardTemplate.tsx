/* eslint-disable @next/next/no-img-element */
'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Layout } from 'lucide-react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function StandardTemplate({ config, url, tenantName, tableName, logoUrl }: QRTemplateProps) {
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

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full">
        {/* Logo or tenant name header */}
        <div className="mb-4 flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={tenantName} className="h-8 w-auto object-contain" />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: config.templateAccentColor }}
            >
              <Layout className="h-4 w-4 text-white" />
            </div>
          )}
          <span className="text-lg font-bold" style={{ color: config.templateTextColor }}>
            {tenantName}
          </span>
        </div>

        {/* Table name badge */}
        {tableName && (
          <div
            className="mb-3 px-4 py-1.5 rounded-full text-sm font-bold"
            style={{
              backgroundColor: config.templateAccentColor,
              color: config.templateBgColor,
            }}
          >
            {tableName}
          </div>
        )}

        {/* QR code in white rounded container */}
        <div className="p-4 bg-white rounded-2xl shadow-inner">
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

        {/* CTA text */}
        <p
          className="mt-4 text-sm font-medium text-center"
          style={{ color: config.templateTextColor }}
        >
          {config.ctaText}
        </p>

        {/* Footer text */}
        {config.footerText && (
          <p
            className="mt-2 text-xs text-center opacity-60"
            style={{ color: config.templateTextColor }}
          >
            {config.footerText}
          </p>
        )}

        {/* Powered by Attabl */}
        {config.showPoweredBy && (
          <p
            className="mt-1 text-[9px] text-center opacity-40"
            style={{ color: config.templateTextColor }}
          >
            Powered by Attabl
          </p>
        )}
      </div>
    </div>
  );
}
