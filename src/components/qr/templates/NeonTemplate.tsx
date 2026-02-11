'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function NeonTemplate({ config, url, tenantName, tableName }: QRTemplateProps) {
  const accentColor = config.templateAccentColor;

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
      <div className="relative z-10 flex flex-col items-center justify-center gap-4 w-full">
        {/* Tenant name in accent color, bold, uppercase, letter-spacing */}
        <h2
          className="text-xl font-bold uppercase tracking-widest text-center"
          style={{
            color: accentColor,
            textShadow: `0 0 10px ${accentColor}80, 0 0 20px ${accentColor}40`,
          }}
        >
          {tenantName}
        </h2>

        {/* Neon line decorative element */}
        <div
          style={{
            width: '100%',
            height: '1px',
            backgroundColor: accentColor,
            boxShadow: `0 0 6px ${accentColor}, 0 0 12px ${accentColor}80`,
          }}
        />

        {/* Table name with glow effect */}
        {tableName && (
          <p
            className="text-sm font-semibold uppercase tracking-wider"
            style={{
              color: accentColor,
              textShadow: `0 0 8px ${accentColor}CC, 0 0 16px ${accentColor}66`,
            }}
          >
            {tableName}
          </p>
        )}

        {/* QR code with glowing border */}
        <div
          className="p-4 rounded-xl"
          style={{
            backgroundColor: '#FFFFFF',
            boxShadow: `0 0 20px ${accentColor}, 0 0 40px ${accentColor}60`,
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

        {/* CTA text in accent color */}
        <p
          className="text-sm font-medium text-center"
          style={{
            color: accentColor,
            textShadow: `0 0 6px ${accentColor}80`,
          }}
        >
          {config.ctaText}
        </p>

        {/* Bottom neon line */}
        <div
          style={{
            width: '100%',
            height: '1px',
            backgroundColor: accentColor,
            boxShadow: `0 0 6px ${accentColor}, 0 0 12px ${accentColor}80`,
          }}
        />

        {/* Footer text */}
        {config.footerText && (
          <p className="text-[10px] text-center opacity-50" style={{ color: accentColor }}>
            {config.footerText}
          </p>
        )}

        {/* Powered by Attabl */}
        {config.showPoweredBy && (
          <p className="text-[8px] text-center opacity-30" style={{ color: accentColor }}>
            Powered by Attabl
          </p>
        )}
      </div>
    </div>
  );
}
