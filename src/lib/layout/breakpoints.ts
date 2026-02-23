/**
 * Centralized breakpoint constants matching Tailwind v4 defaults.
 * Used by DeviceContext and responsive utilities.
 */

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export type LayoutMode = 'bottom-nav' | 'collapsed-sidebar' | 'expanded-sidebar';

/**
 * Maps device type to layout mode for the admin shell.
 */
export function getLayoutMode(device: DeviceType): LayoutMode {
  switch (device) {
    case 'mobile':
      return 'bottom-nav';
    case 'tablet':
      return 'collapsed-sidebar';
    case 'desktop':
      return 'expanded-sidebar';
  }
}

/**
 * Media query strings for JS-side matchMedia usage.
 */
export const MEDIA_QUERIES = {
  mobile: `(max-width: ${BREAKPOINTS.md - 1}px)`,
  tablet: `(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`,
  desktop: `(min-width: ${BREAKPOINTS.lg}px)`,
} as const;
