import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Verification visuelle du lot B2b-2 (defaut 3): en sombre, les badges de la
// console plateforme ("Bloque", "Desactive par le restaurant", "Actif")
// gardaient la couleur de TEXTE du theme clair: 2 a 2,4:1. La console vit hors
// du shell admin; elle reprend en sombre les couleurs de texte du shell.
// Calcul WCAG sur les fonds reels: fond de statut a 15 % (globals.css, bloc
// `:root` sombre) pose sur app-bg (#0a0a0a) ou app-elevated (#161616).

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function oklch(L: number, C: number, h: number): number[] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((x) => {
    const c = Math.min(1, Math.max(0, x));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  });
}
const color = (v: string) => {
  const o = /^oklch\(([\d.]+)_([\d.]+)_([\d.]+)\)$/.exec(v);
  return o ? oklch(Number(o[1]), Number(o[2]), Number(o[3])) : hex(v);
};
const over = (fg: number[], alpha: number, bg: number[]) =>
  fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

const src = readFileSync(
  join(process.cwd(), 'src/components/admin/platform/PlatformConsole.tsx'),
  'utf8',
);
const darkText: Record<string, string> = {};
for (const m of src.matchAll(/dark:\[--color-status-(\w+):([^\]\s]+)\]/g)) darkText[m[1]] = m[2];

// Fonds de statut du bloc `:root` sombre de globals.css (rgba(..., 0.15)).
const statusBg: Record<string, number[]> = {
  success: [5, 150, 105],
  warning: [217, 119, 6],
  error: [220, 38, 38],
  info: [37, 99, 235],
};
const surfaces = { 'app-bg': hex('#0a0a0a'), 'app-elevated': hex('#161616') };

describe('console plateforme: badges de statut lisibles en sombre', () => {
  it.each(Object.keys(statusBg))('%s: au moins 4,5:1 sur les deux surfaces', (k) => {
    expect(darkText[k]).toBeDefined();
    for (const surface of Object.values(surfaces)) {
      expect(ratio(color(darkText[k]), over(statusBg[k], 0.15, surface))).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('temoin negatif: la couleur claire (#92400e) sur fond sombre reste sous 4,5:1', () => {
    expect(ratio(hex('#92400e'), over(statusBg.warning, 0.15, surfaces['app-bg']))).toBeLessThan(
      4.5,
    );
  });

  it('les surcharges ne valent qu en sombre (prefixe dark:)', () => {
    expect(src).not.toMatch(/[\s"]\[--color-status-/);
  });
});
