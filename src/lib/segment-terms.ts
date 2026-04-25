/**
 * Segment-based terminology mapping.
 *
 * Returns i18n key suffixes (resolved via `segment.{family}.{key}`)
 * so that the correct term is displayed per establishment type.
 */

// ─── Types ──────────────────────────────────────────────

export type EstablishmentSegment =
  | 'restaurant'
  | 'hotel'
  | 'bar'
  | 'cafe'
  | 'fastfood'
  | 'other'
  // Legacy — existing tenants only, not shown in onboarding
  | 'retail'
  | 'boutique'
  | 'pharmacy'
  | 'salon';

export type SegmentFamily = 'food' | 'hospitality' | 'retail' | 'services';

export const SEGMENT_FAMILY: Record<EstablishmentSegment, SegmentFamily> = {
  restaurant: 'food',
  hotel: 'hospitality',
  bar: 'food',
  cafe: 'food',
  fastfood: 'food',
  other: 'food',
  // Legacy mappings preserved for existing tenants
  retail: 'retail',
  boutique: 'retail',
  pharmacy: 'retail',
  salon: 'services',
};

// ─── Term keys ──────────────────────────────────────────

/** All available segment term keys */
const SEGMENT_TERM_KEYS = [
  'item',
  'items',
  'addItem',
  'searchItem',
  'worker',
  'workers',
  'production',
  'productionKds',
  'catalog',
  'catalogs',
  'recipe',
  'recipes',
  'allLocations',
  'emailPlaceholder',
  'identityLabel',
  'descPlaceholder',
  'roleChef',
  'roleWaiter',
  'domainPlaceholder',
  'inProduction',
  'productionNote',
  'productionNoteTitle',
  'productionNotePlaceholder',
  'sentToProduction',
  'printProductionTicket',
  'productionTicketPrinted',
  'productionZone',
] as const;

export type SegmentTermKey = (typeof SEGMENT_TERM_KEYS)[number];

/** Pre-computed term key maps per family (avoids re-allocating on every call) */
const TERM_KEYS_BY_FAMILY: Record<
  SegmentFamily,
  Record<SegmentTermKey, string>
> = Object.fromEntries(
  (['food', 'hospitality', 'retail', 'services'] as const).map((family) => [
    family,
    Object.fromEntries(SEGMENT_TERM_KEYS.map((k) => [k, `${family}.${k}`])),
  ]),
) as Record<SegmentFamily, Record<SegmentTermKey, string>>;

// ─── Public API ─────────────────────────────────────────

/**
 * Get the segment family for a given establishment type.
 * Falls back to 'food' for unknown types.
 */
export function getSegmentFamily(type: string | undefined | null): SegmentFamily {
  return SEGMENT_FAMILY[(type ?? 'restaurant') as EstablishmentSegment] ?? 'food';
}

/**
 * Get all segment term i18n keys for a given establishment type.
 * Returns an object where each value is the full i18n key path.
 *
 * Example: `getSegmentTermKeys('retail')` → `{ item: 'retail.item', ... }`
 * These keys are resolved within the `segment` namespace.
 */
export function getSegmentTermKeys(
  type: string | undefined | null,
): Record<SegmentTermKey, string> {
  return TERM_KEYS_BY_FAMILY[getSegmentFamily(type)];
}
