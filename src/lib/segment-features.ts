/**
 * Segment-based feature visibility.
 *
 * Determines which admin modules are visible for each segment family.
 * Used by sidebar, onboarding, and route guards.
 */

import { type SegmentFamily, getSegmentFamily } from './segment-terms';

// ─── Feature flags per segment family ───────────────────

export interface SegmentFeatureFlags {
  /** Show Kitchen Display System (KDS) */
  showKds: boolean;
  /** Show Tables & Zones management */
  showTables: boolean;
  /** Show Service (waiter assignments) */
  showService: boolean;
  /** Show Recipe / Technical sheets */
  showRecipes: boolean;
  /** Show QR Codes generation */
  showQrCodes: boolean;
}

const SEGMENT_FEATURES: Record<SegmentFamily, SegmentFeatureFlags> = {
  food: {
    showKds: true,
    showTables: true,
    showService: true,
    showRecipes: true,
    showQrCodes: true,
  },
  hospitality: {
    showKds: true,
    showTables: true,
    showService: true,
    showRecipes: true,
    showQrCodes: true,
  },
  retail: {
    showKds: false,
    showTables: false,
    showService: false,
    showRecipes: true,
    showQrCodes: true,
  },
  services: {
    showKds: false,
    showTables: false,
    showService: false,
    showRecipes: false,
    showQrCodes: false,
  },
};

// ─── Public API ─────────────────────────────────────────

/**
 * Get feature flags for a given establishment type.
 */
export function getSegmentFeatures(type: string | undefined | null): SegmentFeatureFlags {
  return SEGMENT_FEATURES[getSegmentFamily(type)];
}

/**
 * Navigation group IDs that are conditionally hidden per segment.
 * Returns the set of nav group IDs to hide.
 */
export function getHiddenNavGroupIds(type: string | undefined | null): Set<string> {
  const features = getSegmentFeatures(type);
  const hidden = new Set<string>();
  if (!features.showKds) hidden.add('kitchen');
  if (!features.showService) hidden.add('service');
  return hidden;
}

/**
 * Navigation item paths that are conditionally hidden per segment.
 * Returns the set of item paths to hide.
 */
export function getHiddenNavItemPaths(type: string | undefined | null): Set<string> {
  const features = getSegmentFeatures(type);
  const hidden = new Set<string>();
  if (!features.showRecipes) hidden.add('/recipes');
  return hidden;
}
