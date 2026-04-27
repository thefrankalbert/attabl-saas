/* eslint-disable @next/next/no-img-element */
'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { Layout } from 'lucide-react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function StandardTemplate({
  config,
  url,
  tenantName,
  tableName,
  logoUrl,
  isExport,
}: QRTemplateProps) {
  // >= so square (100x100) maps to landscape, matching TEMPLATE_DEFAULTS.standard.orientation
  const isLandscape = config.templateWidth >= config.templateHeight;
  const textScale = config.textScale ?? 1;
  const showName = config.showName !== false;
  const showCta = config.showCta !== false;

  const Header = (showName || (logoUrl && config.logo.enabled)) && (
    <div className="flex items-center gap-2">
      {logoUrl && config.logo.enabled ? (
        <img src={logoUrl} alt={tenantName} className="h-8 w-auto object-contain" />
      ) : (
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: config.templateAccentColor }}
        >
          <Layout className="h-4 w-4 text-white" />
        </div>
      )}
      {showName && (
        <span
          className="font-bold"
          style={{ color: config.templateTextColor, fontSize: `${1.125 * textScale}rem` }}
        >
          {tenantName}
        </span>
      )}
    </div>
  );

  const Badge = tableName && (
    <div
      className="px-4 py-1.5 rounded-full text-sm font-bold"
      style={{
        backgroundColor: config.templateAccentColor,
        color: config.templateAccentTextColor ?? config.templateBgColor,
      }}
    >
      {tableName}
    </div>
  );

  const QR = (
    <div className="p-4 bg-white rounded-2xl shadow-inner shrink-0">
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

  const Footer = (showCta || config.descriptionText || config.footerText || config.showPoweredBy) && (
    <div className="flex flex-col gap-1">
      {showCta && (
        <p
          className="font-medium text-center"
          style={{ color: config.templateTextColor, fontSize: `${0.875 * textScale}rem` }}
        >
          {config.ctaText}
        </p>
      )}
      {config.descriptionText && (
        <p
          className="text-center opacity-70"
          style={{ color: config.templateTextColor, fontSize: `${0.75 * textScale}rem` }}
        >
          {config.descriptionText}
        </p>
      )}
      {config.footerText && (
        <p
          className="text-center opacity-60"
          style={{ color: config.templateTextColor, fontSize: `${0.75 * textScale}rem` }}
        >
          {config.footerText}
        </p>
      )}
      {config.showPoweredBy && (
        <p
          className="text-[10px] text-center opacity-40"
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

      {(() => {
        const qrPosition = config.qrPosition ?? 'center';
        if (isLandscape) {
          if (qrPosition === 'start') {
            return (
              <div className="relative z-10 flex items-center justify-center gap-6 w-full h-full">
                {QR}
                <div className="flex flex-col items-center justify-center gap-3 flex-1">
                  {Header}
                  {Badge}
                  {Footer}
                </div>
              </div>
            );
          }
          if (qrPosition === 'center') {
            return (
              <div className="relative z-10 flex flex-col items-center justify-center gap-3 w-full h-full">
                {Header}
                {Badge}
                {QR}
                {Footer}
              </div>
            );
          }
          return (
            <div className="relative z-10 flex items-center justify-center gap-6 w-full h-full">
              <div className="flex flex-col items-center justify-center gap-3 flex-1">
                {Header}
                {Badge}
                {Footer}
              </div>
              {QR}
            </div>
          );
        }
        // Portrait
        if (qrPosition === 'start') {
          return (
            <div className="relative z-10 flex flex-col items-center justify-center gap-3 w-full h-full">
              {QR}
              {Header}
              {Badge}
              {Footer}
            </div>
          );
        }
        if (qrPosition === 'end') {
          return (
            <div className="relative z-10 flex flex-col items-center justify-center gap-3 w-full h-full">
              {Header}
              {Badge}
              {Footer}
              {QR}
            </div>
          );
        }
        return (
          <div className="relative z-10 flex flex-col items-center justify-center gap-3 w-full h-full">
            {Header}
            {Badge}
            {QR}
            {Footer}
          </div>
        );
      })()}
    </div>
  );
}
