import { describe, it, expect } from 'vitest';
import { contrastRatio, isQrScannable, scannableQrColors } from '../qr-contrast';

describe('lisibilite des couleurs de QR', () => {
  it('accepte les couleurs lisibles mesurees', () => {
    expect(isQrScannable('#000000', '#FFFFFF')).toBe(true);
    expect(isQrScannable('#1E3A8A', '#FFFFFF')).toBe(true); // bleu nuit
    expect(isQrScannable('#000000', '#CCFF00')).toBe(true); // noir sur lime
    expect(isQrScannable('#4d7c0f', '#FFFFFF')).toBe(true); // couleur par defaut de l'inscription
  });

  it('refuse le lime sur blanc (echoue en photo) et le clair sur fonce', () => {
    expect(isQrScannable('#CCFF00', '#FFFFFF')).toBe(false);
    expect(isQrScannable('#FFD400', '#FFFFFF')).toBe(false);
    expect(isQrScannable('#FFFFFF', '#000000')).toBe(false); // inverse
    expect(isQrScannable('#FFFFFF', '#1a1a1a')).toBe(false); // sombre
  });

  it('refuse une couleur illisible plutot que de deviner', () => {
    expect(isQrScannable('rouge', '#FFFFFF')).toBe(false);
    expect(contrastRatio('rouge', '#FFFFFF')).toBeNull();
  });

  it('calcule le contraste WCAG connu', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('garde les couleurs lisibles et remplace les autres par du noir', () => {
    expect(scannableQrColors('#1E3A8A', '#FFFFFF')).toEqual({ fg: '#1E3A8A', bg: '#FFFFFF' });
    expect(scannableQrColors('#CCFF00', '#FFFFFF')).toEqual({ fg: '#000000', bg: '#FFFFFF' });
    expect(scannableQrColors('#FFFFFF', '#000000')).toEqual({ fg: '#000000', bg: '#FFFFFF' });
    expect(scannableQrColors('#FFFFFF', '#CCFF00')).toEqual({ fg: '#000000', bg: '#CCFF00' });
  });
});
