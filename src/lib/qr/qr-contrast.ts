/**
 * Lisibilite d'un QR code selon ses couleurs.
 *
 * Mesure du 2026-11-23 (QR generes par qr-code-styling, lus par zxing-wasm,
 * photo d'un QR imprime simulee): vert lime sur blanc se lit sur une image
 * parfaite mais echoue en photo, et un QR clair sur fond fonce n'est lu que
 * par les lecteurs qui savent inverser l'image (beaucoup d'appareils photo de
 * telephone ne le font pas). Un QR doit donc avoir des points FONCES sur un
 * fond CLAIR, avec un contraste suffisant.
 */

/** Contraste minimal (ratio WCAG) entre les points et le fond. */
export const MIN_QR_CONTRAST = 3;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function relativeLuminance(hex: string): number | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG entre deux couleurs hexadecimales (1 a 21). */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Vrai si un telephone lira ce QR: points plus fonces que le fond, contraste suffisant. */
export function isQrScannable(fg: string, bg: string): boolean {
  const lf = relativeLuminance(fg);
  const lb = relativeLuminance(bg);
  if (lf === null || lb === null) return false;
  return lf < lb && (lb + 0.05) / (lf + 0.05) >= MIN_QR_CONTRAST;
}

/**
 * Couleurs a imprimer: celles choisies si elles sont lisibles, sinon des points
 * noirs (sur le fond choisi s'il reste assez clair, sinon sur du blanc).
 */
export function scannableQrColors(fg: string, bg: string): { fg: string; bg: string } {
  if (isQrScannable(fg, bg)) return { fg, bg };
  return { fg: '#000000', bg: isQrScannable('#000000', bg) ? bg : '#FFFFFF' };
}
