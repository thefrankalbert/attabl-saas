/* eslint-disable @next/next/no-img-element */
'use client';

import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import type { ChevaletConfig } from '@/types/supports.types';

// Scale: 1cm = 28px in preview
const SCALE = 28;
const W_CM = 21.7;
const H_CM = 11;
const W_PX = W_CM * SCALE; // 607.6px
const H_PX = H_CM * SCALE; // 308px

interface ChevaletPreviewProps {
  config: ChevaletConfig;
  logoUrl: string | null;
  previewRef?: React.RefObject<HTMLDivElement | null>;
}

function Panel({
  config,
  logoUrl,
  label,
  isVersoBgOnly,
}: {
  config: ChevaletConfig;
  logoUrl: string | null;
  label: string;
  isVersoBgOnly?: boolean;
}) {
  const qrDark =
    config.qrCode.style === 'inverted' || config.qrCode.style === 'dark' ? '#FFFFFF' : '#000000';
  const qrLight = config.qrCode.style === 'inverted' ? '#000000' : 'transparent';

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-app-text-muted tracking-widest uppercase">
        {label}
      </span>
      <div
        style={{
          width: W_PX,
          height: H_PX,
          backgroundColor: config.background,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 4,
        }}
      >
        {isVersoBgOnly ? (
          // Verso "logo seul"
          config.logo.visible &&
          logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: config.logo.width * SCALE,
                objectFit: 'contain',
              }}
            />
          )
        ) : (
          <>
            {/* Logo */}
            {config.logo.visible && logoUrl && (
              <img
                src={logoUrl}
                alt="Logo"
                style={{
                  position: 'absolute',
                  left: config.logo.x * SCALE,
                  top: config.logo.y * SCALE,
                  width: config.logo.width * SCALE,
                  objectFit: 'contain',
                }}
              />
            )}

            {/* Nom */}
            {config.name.visible && (
              <span
                style={{
                  position: 'absolute',
                  left: config.name.x * SCALE,
                  top: config.name.y * SCALE,
                  fontSize: config.name.fontSize * (SCALE / 28),
                  color: config.accentColor,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  lineHeight: 1.2,
                }}
              >
                {config.name.text}
              </span>
            )}

            {/* Tagline */}
            {config.tagline.visible && (
              <span
                style={{
                  position: 'absolute',
                  left: config.tagline.x * SCALE,
                  top: config.tagline.y * SCALE,
                  fontSize: config.tagline.fontSize * (SCALE / 28),
                  color: config.accentColor,
                  opacity: 0.75,
                  maxWidth: (W_CM - config.tagline.x - 0.5) * SCALE,
                  lineHeight: 1.3,
                }}
              >
                {config.tagline.text}
              </span>
            )}

            {/* QR Code */}
            <div
              style={{
                position: 'absolute',
                left: config.qrCode.x * SCALE,
                top: config.qrCode.y * SCALE,
                width: config.qrCode.width * SCALE,
                height: config.qrCode.width * SCALE,
              }}
            >
              <QRCodeSVG
                value={config.qrCode.menuUrl || 'https://attabl.com'}
                size={config.qrCode.width * SCALE}
                fgColor={qrDark}
                bgColor={qrLight}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ChevaletPreview({ config, logoUrl, previewRef }: ChevaletPreviewProps) {
  const t = useTranslations('sidebar.supports');

  return (
    <div className="flex flex-col items-center gap-4 w-full overflow-x-auto">
      {/* Recto */}
      <div ref={previewRef}>
        <Panel config={config} logoUrl={logoUrl} label={t('rectoLabel')} />
      </div>

      {/* Verso - seulement si pas "none" */}
      {config.verso !== 'none' && (
        <Panel
          config={config}
          logoUrl={logoUrl}
          label={t('versoLabel')}
          isVersoBgOnly={config.verso === 'logo'}
        />
      )}
    </div>
  );
}
