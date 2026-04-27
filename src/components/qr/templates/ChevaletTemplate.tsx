/* eslint-disable @next/next/no-img-element */
'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { Layout } from 'lucide-react';
import type { QRTemplateProps } from '@/types/qr-design.types';
import { SHADOW_CLASSES } from '@/types/qr-design.types';

export function ChevaletTemplate({
  config,
  url,
  tenantName,
  tableName,
  logoUrl,
  isExport,
}: QRTemplateProps) {
  const isLandscape = config.templateWidth > config.templateHeight;
  const textScale = config.textScale ?? 1;
  const showName = config.showName !== false;
  const showCta = config.showCta !== false;

  const Header = (showName || (logoUrl && config.logo.enabled)) && (
    <div className="text-center">
      {logoUrl && config.logo.enabled ? (
        <img src={logoUrl} alt={tenantName} className="h-12 w-auto object-contain mx-auto mb-2" />
      ) : (
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2"
          style={{ backgroundColor: config.templateAccentColor }}
        >
          <Layout
            className="h-6 w-6"
            style={{ color: config.templateAccentTextColor ?? config.templateBgColor }}
          />
        </div>
      )}
      {showName && (
        <h2
          className="font-bold"
          style={{ color: config.templateTextColor, fontSize: `${1.25 * textScale}rem` }}
        >
          {tenantName}
        </h2>
      )}
      {config.descriptionText && (
        <p
          className="mt-1 opacity-80"
          style={{ color: config.templateTextColor, fontSize: `${0.75 * textScale}rem` }}
        >
          {config.descriptionText}
        </p>
      )}
    </div>
  );

  const Badge = tableName && (
    <div
      className="px-5 py-1.5 rounded-full text-sm font-bold"
      style={{
        backgroundColor: config.templateAccentColor,
        color: config.templateAccentTextColor ?? config.templateBgColor,
      }}
    >
      {tableName}
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

  const Footer = (showCta || config.footerText || config.showPoweredBy) && (
    <div className="text-center" style={{ color: config.templateTextColor }}>
      {showCta && (
        <p className="font-bold mb-1" style={{ fontSize: `${1.125 * textScale}rem` }}>
          {config.ctaText}
        </p>
      )}
      {showCta && (
        <p className="opacity-70" style={{ fontSize: `${0.75 * textScale}rem` }}>
          Menu digital &bull; Commande rapide
        </p>
      )}
      {config.footerText && (
        <p className="mt-2 text-center opacity-60" style={{ fontSize: `${0.75 * textScale}rem` }}>
          {config.footerText}
        </p>
      )}
      {config.showPoweredBy && (
        <p className="mt-1 text-[10px] text-center opacity-40">Powered by Attabl</p>
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
            backgroundColor: config.templateAccentColor,
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
