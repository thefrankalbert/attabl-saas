'use client';

import { useEffect, useRef } from 'react';
import type QRCodeStyling from 'qr-code-styling';
import type { Options } from 'qr-code-styling';
import type { QRDotStyle, QRCornerStyle, QRErrorCorrectionLevel } from '@/types/qr-design.types';

interface StyledQRProps {
  value: string;
  size: number;
  fgColor: string;
  bgColor: string;
  dotStyle: QRDotStyle;
  cornerStyle: QRCornerStyle;
  errorCorrection: QRErrorCorrectionLevel;
  logoSrc?: string;
  logoSize?: number; // 0..1 relative to QR
  margin?: number;
}

// Map our corner style to qr-code-styling's corner square types.
function cornerType(style: QRCornerStyle): 'square' | 'dot' | 'extra-rounded' {
  return style === 'rounded' ? 'extra-rounded' : style;
}

/**
 * Premium QR renderer backed by qr-code-styling (rounded dots, styled corners,
 * centered logo). Client-only + dynamically imported so it never runs during SSR
 * and stays out of the main bundle. Rendered as inline SVG so html2canvas can
 * rasterize it for PDF/PNG export.
 */
export function StyledQR({
  value,
  size,
  fgColor,
  bgColor,
  dotStyle,
  cornerStyle,
  errorCorrection,
  logoSrc,
  logoSize = 0.22,
  margin = 2,
}: StyledQRProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    let cancelled = false;

    const options: Options = {
      width: size,
      height: size,
      type: 'svg',
      data: value,
      margin,
      qrOptions: { errorCorrectionLevel: errorCorrection },
      image: logoSrc || undefined,
      imageOptions: { crossOrigin: 'anonymous', margin: 4, imageSize: logoSize },
      dotsOptions: { color: fgColor, type: dotStyle },
      backgroundOptions: { color: bgColor },
      cornersSquareOptions: { color: fgColor, type: cornerType(cornerStyle) },
      cornersDotOptions: { color: fgColor, type: cornerStyle === 'square' ? 'square' : 'dot' },
    };

    async function render() {
      const { default: QRCodeStylingCtor } = await import('qr-code-styling');
      if (cancelled) return;
      if (!instanceRef.current) {
        instanceRef.current = new QRCodeStylingCtor(options);
        if (containerRef.current) {
          containerRef.current.replaceChildren();
          instanceRef.current.append(containerRef.current);
        }
      } else {
        instanceRef.current.update(options);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [
    value,
    size,
    fgColor,
    bgColor,
    dotStyle,
    cornerStyle,
    errorCorrection,
    logoSrc,
    logoSize,
    margin,
  ]);

  return <div ref={containerRef} style={{ width: size, height: size, lineHeight: 0 }} />;
}
