import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// B128 (revue ligne par ligne, lot B2b-2): le bouton rouge de confirmation
// (`bg-[var(--destructive)] text-[var(--destructive-foreground)]`) mesurait
// 2,77:1 en mode sombre (seuil WCAG AA du texte: 4,5:1). Le calcul part des
// valeurs OKLCH ecrites dans globals.css.

function oklchToLinearRgb(L: number, C: number, h: number): number[] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((x) => Math.min(1, Math.max(0, x)));
}

function contrast(a: number[], b: number[]): number {
  const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function tokens(block: string): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const m of block.matchAll(
    /--(destructive(?:-foreground)?):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g,
  )) {
    out[m[1]] = oklchToLinearRgb(Number(m[2]), Number(m[3]), Number(m[4]));
  }
  return out;
}

const css = readFileSync(join(process.cwd(), 'src/styles/attabl-base.css'), 'utf8');
const darkStart = css.indexOf(':root:has(.admin-shell.dark) {');
const darkBlock = css.slice(darkStart, css.indexOf('\n}', darkStart));
const lightStart = css.indexOf(':root:has(.admin-shell:not(.dark)) {');
const lightBlock = css.slice(lightStart, css.indexOf('\n}', lightStart));

describe('jeton destructive: contraste du texte sur le bouton rouge', () => {
  it('mode sombre: au moins 4,5:1', () => {
    const t = tokens(darkBlock);
    expect(t.destructive).toBeDefined();
    expect(t['destructive-foreground']).toBeDefined();
    expect(contrast(t.destructive, t['destructive-foreground'])).toBeGreaterThanOrEqual(4.5);
  });

  it('temoin: mode clair, au moins 4,5:1 (4,56:1, inchange)', () => {
    const t = tokens(lightBlock);
    expect(contrast(t.destructive, t['destructive-foreground'])).toBeGreaterThanOrEqual(4.5);
  });
});
