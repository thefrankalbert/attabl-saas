'use client';

import { createContext, useContext, useEffect, useMemo, ReactNode } from 'react';

/**
 * Tenant brand color scope.
 *
 * Per 2025/2026 market research on food ordering apps (UberEats, Deliveroo,
 * Just Eat, Grubhub), the tenant can only customize a SINGLE brand color:
 * the primary CTA color. All other colors (background, text, surfaces) are
 * locked to the light-mode palette defined in globals.css under .tenant-client.
 *
 * `--tenant-primary` (and opacity variants 10/20/50 for hover/active/disabled)
 * is the ONLY customizable token. Text color is always forced to #1A1A1A.
 */
interface ThemeColors {
  primaryColor: string;
  /**
   * Retained for API compatibility but NOT injected into the DOM.
   * Text color is hardcoded to #1A1A1A per market research.
   */
  secondaryColor?: string;
}

interface ThemeContextType {
  colors: ThemeColors;
  applyTheme: (colors: ThemeColors) => void;
}

const DEFAULT_PRIMARY = '#1A1A1A';

const defaultColors: ThemeColors = {
  primaryColor: DEFAULT_PRIMARY,
  secondaryColor: '#1A1A1A',
};

const ThemeContext = createContext<ThemeContextType>({
  colors: defaultColors,
  applyTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Validate a hex color. Must be exactly 7 characters: `#` + 6 hex digits.
 * Falls back to the default brand primary if invalid.
 */
function sanitizePrimary(input: string | undefined | null): string {
  if (!input || typeof input !== 'string') return DEFAULT_PRIMARY;
  const trimmed = input.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return DEFAULT_PRIMARY;
  return trimmed;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Injects ONLY the tenant primary color and its opacity variants into the DOM.
 * Per market research, primary is the only customizable color - no secondary,
 * no background, no text color overrides. Text stays forced at #1A1A1A.
 */
function applyColorsToDOM(colors: ThemeColors) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const primary = sanitizePrimary(colors.primaryColor);

  root.style.setProperty('--tenant-primary', primary);

  const primaryRGB = hexToRgb(primary);
  if (primaryRGB) {
    const { r, g, b } = primaryRGB;
    root.style.setProperty('--tenant-primary-rgb', `${r}, ${g}, ${b}`);
    root.style.setProperty('--tenant-primary-10', `rgba(${r}, ${g}, ${b}, 0.1)`);
    root.style.setProperty('--tenant-primary-20', `rgba(${r}, ${g}, ${b}, 0.2)`);
    root.style.setProperty('--tenant-primary-50', `rgba(${r}, ${g}, ${b}, 0.5)`);
  }
}

interface ThemeProviderProps {
  children: ReactNode;
  initialColors?: ThemeColors;
}

export function ThemeProvider({ children, initialColors }: ThemeProviderProps) {
  const colors: ThemeColors = useMemo(
    () => ({
      primaryColor: sanitizePrimary(initialColors?.primaryColor),
      secondaryColor: '#1A1A1A',
    }),
    [initialColors?.primaryColor],
  );

  useEffect(() => {
    applyColorsToDOM(colors);
  }, [colors]);

  const applyTheme = (newColors: ThemeColors) => {
    applyColorsToDOM({
      primaryColor: sanitizePrimary(newColors.primaryColor),
      secondaryColor: '#1A1A1A',
    });
  };

  return <ThemeContext.Provider value={{ colors, applyTheme }}>{children}</ThemeContext.Provider>;
}

/**
 * Server-side helper to generate inline CSS for the tenant primary color.
 * Only injects --tenant-primary and opacity variants - no secondary color.
 */
export function generateTenantCSS(primaryColor: string, _secondaryColor?: string): string {
  void _secondaryColor;
  const primary = sanitizePrimary(primaryColor);
  const primaryRGB = hexToRgb(primary);

  return `
    :root {
      --tenant-primary: ${primary};
      ${
        primaryRGB
          ? `
        --tenant-primary-rgb: ${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b};
        --tenant-primary-10: rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.1);
        --tenant-primary-20: rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.2);
        --tenant-primary-50: rgba(${primaryRGB.r}, ${primaryRGB.g}, ${primaryRGB.b}, 0.5);
      `
          : ''
      }
    }
  `.trim();
}
