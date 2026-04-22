'use client';

import { useEffect, useMemo, ReactNode } from 'react';

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
 *
 * NOTE: this provider is independent from next-themes. next-themes manages
 * dark/light at the app level (admin / marketing / auth); this provider only
 * scopes a tenant's primary brand color in the public client (where dark
 * mode is force-disabled via forcedTheme="light" on the parent provider).
 */
interface TenantBrandColors {
  primaryColor: string;
}

const DEFAULT_PRIMARY = '#1A1A1A';

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
function applyColorsToDOM(colors: TenantBrandColors) {
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

interface TenantBrandProviderProps {
  children: ReactNode;
  initialColors?: TenantBrandColors;
}

export function TenantBrandProvider({ children, initialColors }: TenantBrandProviderProps) {
  const colors: TenantBrandColors = useMemo(
    () => ({
      primaryColor: sanitizePrimary(initialColors?.primaryColor),
    }),
    [initialColors?.primaryColor],
  );

  useEffect(() => {
    applyColorsToDOM(colors);
  }, [colors]);

  return <>{children}</>;
}
