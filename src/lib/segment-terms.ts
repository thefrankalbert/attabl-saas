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
  | 'retail'
  | 'boutique'
  | 'pharmacy'
  | 'salon'
  | 'other';

export type SegmentFamily = 'food' | 'hospitality' | 'retail' | 'services';

export const SEGMENT_FAMILY: Record<EstablishmentSegment, SegmentFamily> = {
  restaurant: 'food',
  hotel: 'hospitality',
  bar: 'food',
  cafe: 'food',
  fastfood: 'food',
  retail: 'retail',
  boutique: 'retail',
  pharmacy: 'retail',
  salon: 'services',
  other: 'retail',
};

// ─── Term keys ──────────────────────────────────────────

/** All available segment term keys */
export type SegmentTermKey =
  | 'item'
  | 'items'
  | 'addItem'
  | 'searchItem'
  | 'worker'
  | 'workers'
  | 'production'
  | 'productionKds'
  | 'catalog'
  | 'catalogs'
  | 'recipe'
  | 'recipes'
  | 'allLocations'
  | 'emailPlaceholder'
  | 'identityLabel'
  | 'descPlaceholder'
  | 'roleChef'
  | 'roleWaiter'
  | 'domainPlaceholder';

// ─── Public API ─────────────────────────────────────────

/**
 * Get the segment family for a given establishment type.
 * Falls back to 'food' for unknown types.
 */
export function getSegmentFamily(type: string | undefined | null): SegmentFamily {
  return SEGMENT_FAMILY[(type as EstablishmentSegment) ?? 'restaurant'] ?? 'food';
}

/**
 * Get the i18n namespace prefix for segment terms.
 * Usage: `t(\`segment.${getSegmentPrefix(type)}.item\`)`
 */
export function getSegmentPrefix(type: string | undefined | null): SegmentFamily {
  return getSegmentFamily(type);
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
  const family = getSegmentFamily(type);
  return {
    item: `${family}.item`,
    items: `${family}.items`,
    addItem: `${family}.addItem`,
    searchItem: `${family}.searchItem`,
    worker: `${family}.worker`,
    workers: `${family}.workers`,
    production: `${family}.production`,
    productionKds: `${family}.productionKds`,
    catalog: `${family}.catalog`,
    catalogs: `${family}.catalogs`,
    recipe: `${family}.recipe`,
    recipes: `${family}.recipes`,
    allLocations: `${family}.allLocations`,
    emailPlaceholder: `${family}.emailPlaceholder`,
    identityLabel: `${family}.identityLabel`,
    descPlaceholder: `${family}.descPlaceholder`,
    roleChef: `${family}.roleChef`,
    roleWaiter: `${family}.roleWaiter`,
    domainPlaceholder: `${family}.domainPlaceholder`,
  };
}
