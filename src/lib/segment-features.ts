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

/** Navigation elements to hide, pre-computed per segment family */
interface HiddenNav {
  groupIds: Set<string>;
  itemPaths: Set<string>;
}

const HIDDEN_NAV_BY_FAMILY: Record<SegmentFamily, HiddenNav> = Object.fromEntries(
  (['food', 'hospitality', 'retail', 'services'] as const).map((family) => {
    const f = SEGMENT_FEATURES[family];
    const groupIds = new Set<string>();
    const itemPaths = new Set<string>();
    if (!f.showKds) groupIds.add('kitchen');
    if (!f.showService) groupIds.add('service');
    if (!f.showRecipes) itemPaths.add('/recipes');
    return [family, { groupIds, itemPaths }];
  }),
) as Record<SegmentFamily, HiddenNav>;

/**
 * Get hidden navigation group IDs and item paths for a given establishment type.
 * Returns pre-computed Sets (no allocation per call).
 */
export function getHiddenNav(type: string | undefined | null): HiddenNav {
  return HIDDEN_NAV_BY_FAMILY[getSegmentFamily(type)];
}
