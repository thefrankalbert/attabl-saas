import { useTenant } from '@/contexts/TenantContext';
import { getSegmentFeatures, type SegmentFeatureFlags } from '@/lib/segment-features';

/**
 * Hook that returns feature flags based on the tenant's establishment type.
 *
 * Usage:
 * ```tsx
 * const features = useSegmentFeatures();
 * if (features.showKds) { ... }
 * ```
 */
export function useSegmentFeatures(): SegmentFeatureFlags {
  const { tenant } = useTenant();
  return getSegmentFeatures(tenant?.establishment_type);
}
