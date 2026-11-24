import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { C } from '../phone/tokens';

/**
 * Contre-audit 5 (axe-core, section 8): les textes de l'onboarding signales a
 * 2,0-3,15 passent a 4,5:1 au moins, en clair ET en sombre. Ratios calcules
 * sur les valeurs RESOLUES des jetons de globals.css (`:root` = sombre par
 * defaut, `.light` = clair) et de l'apercu telephone.
 */
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}', start));
}

function token(scope: string, name: string): string {
  const body = block(scope);
  const at = body.indexOf(`--${name}:`);
  if (at < 0) throw new Error(`${name} absent de ${scope}`);
  const value = body
    .slice(at + name.length + 3)
    .trim()
    .slice(0, 7);
  expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const THEMES = [
  ['clair', '.light'],
  ['sombre', ':root'],
] as const;

describe('contrastes de l onboarding (WCAG AA, 4,5:1)', () => {
  it.each(THEMES)('%s: text-app-text-secondary sur les fonds de l onboarding', (_t, scope) => {
    const fg = token(scope, 'app-text-secondary');
    for (const bg of ['app-bg', 'app-card', 'app-elevated']) {
      expect(ratio(fg, token(scope, bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(THEMES)('%s, temoin: text-app-text-muted restait sous 4,5:1', (_t, scope) => {
    expect(ratio(token(scope, 'app-text-muted'), token(scope, 'app-elevated'))).toBeLessThan(4.5);
  });

  it('les textes signales utilisent le jeton secondaire', () => {
    expect(src('src/components/onboarding/tables/ModeSelector.tsx')).toContain(
      'leading-relaxed text-app-text-secondary',
    );
    expect(src('src/components/onboarding/OnboardingTopNav.tsx')).toContain(
      'text-[10px] text-app-text-secondary',
    );
    for (const f of ['CompleteZones', 'MinimumZones']) {
      expect(src(`src/components/onboarding/tables/${f}.tsx`)).not.toMatch(
        /text-xs[^"]*text-app-text-muted/,
      );
    }
  });

  it('apercu telephone: texte factice de recherche a 4,5:1 sur son fond', () => {
    expect(ratio(C.searchPlaceholder, C.surface)).toBeGreaterThanOrEqual(4.5);
    // Temoin: l'ancienne couleur donnait 2:1.
    expect(ratio(C.textMuted, C.surface)).toBeLessThan(2.1);
    expect(src('src/components/onboarding/phone/PhoneHeader.tsx')).toContain(
      'color: C.searchPlaceholder',
    );
  });
});
