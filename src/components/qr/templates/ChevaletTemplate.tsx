/* eslint-disable @next/next/no-img-element */
'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Layout } from 'lucide-react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function ChevaletTemplate({ config, url, tenantName, tableName, logoUrl }: QRTemplateProps) {
  // Chevalet uses inverted scheme: accent as main bg, bgColor as text
  return (
    <div
      style={{
        width: `${config.templateWidth * 3.78}px`,
        height: `${config.templateHeight * 3.78}px`,
        borderRadius: `${config.cornerRadius}px`,
        padding: `${config.padding}px`,
        backgroundColor: config.gradient.enabled ? undefined : config.templateAccentColor,
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
      className={`flex flex-col items-center ${SHADOW_CLASSES[config.shadow]}`}
    >
      {/* Background image overlay */}
      {config.backgroundImage.enabled && config.backgroundImage.src && !config.gradient.enabled && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: config.templateAccentColor,
            opacity: 1 - (config.backgroundImage.opacity ?? 0.5),
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full h-full">
        {/* Header: Logo or icon */}
        <div className="text-center mb-4">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={tenantName}
              className="h-12 w-auto object-contain mx-auto mb-2"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2"
              style={{ backgroundColor: config.templateBgColor }}
            >
              <Layout className="h-6 w-6" style={{ color: config.templateAccentColor }} />
            </div>
          )}

          {/* Tenant name (large, bold) */}
          <h2 className="text-xl font-bold" style={{ color: config.templateBgColor }}>
            {tenantName}
          </h2>

          {/* Description text */}
          {config.descriptionText && (
            <p className="text-xs mt-1 opacity-80" style={{ color: config.templateBgColor }}>
              {config.descriptionText}
            </p>
          )}
        </div>

        {/* Table name badge (inverted: bg=bgColor, text=accentColor) */}
        {tableName && (
          <div
            className="mb-3 px-5 py-1.5 rounded-full text-sm font-bold"
            style={{
              backgroundColor: config.templateBgColor,
              color: config.templateAccentColor,
            }}
          >
            {tableName}
          </div>
        )}

        {/* QR code in white rounded container (flex-1 to fill space) */}
        <div className="p-4 bg-white rounded-2xl shadow-lg flex-1 flex items-center">
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

        {/* CTA area */}
        <div className="mt-4 text-center" style={{ color: config.templateBgColor }}>
          <p className="text-lg font-bold mb-1">{config.ctaText}</p>
          <p className="text-xs opacity-70">Menu digital &bull; Commande rapide</p>
        </div>

        {/* Footer text */}
        {config.footerText && (
          <p
            className="mt-2 text-xs text-center opacity-60"
            style={{ color: config.templateBgColor }}
          >
            {config.footerText}
          </p>
        )}

        {/* Powered by Attabl */}
        {config.showPoweredBy && (
          <p
            className="mt-1 text-[9px] text-center opacity-40"
            style={{ color: config.templateBgColor }}
          >
            Powered by Attabl
          </p>
        )}
      </div>
    </div>
  );
}
