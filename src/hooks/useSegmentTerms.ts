import { useTranslations } from 'next-intl';
import { useTenant } from '@/contexts/TenantContext';
import { getSegmentTermKeys, type SegmentTermKey } from '@/lib/segment-terms';

/**
 * Hook that returns segment-aware translated terms.
 *
 * Usage:
 * ```tsx
 * const terms = useSegmentTerms();
 * return <h1>{terms.item}</h1>; // "Plat" for restaurants, "Article" for retail
 * ```
 */
export function useSegmentTerms(): Record<SegmentTermKey, string> {
  const { tenant } = useTenant();
  const t = useTranslations('segment');
  const keys = getSegmentTermKeys(tenant?.establishment_type);

  const result = {} as Record<SegmentTermKey, string>;
  for (const [key, i18nKey] of Object.entries(keys)) {
    result[key as SegmentTermKey] = t(i18nKey);
  }
  return result;
}
