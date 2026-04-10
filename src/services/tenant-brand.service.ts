/**
 * Tenant brand service.
 *
 * Persists tenant brand customization (primary color, font) after
 * enforcing WCAG AA contrast and curated font validation via Zod.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { tenantBrandUpdateSchema } from '@/lib/validations/tenant-brand.schema';

export function createTenantBrandService(supabase: SupabaseClient) {
  return {
    async updateBrand(tenantId: string, input: unknown): Promise<{ success: true }> {
      const parsed = tenantBrandUpdateSchema.safeParse(input);
      if (!parsed.success) {
        throw new ServiceError(
          parsed.error.issues[0]?.message || 'Invalid input',
          'VALIDATION',
          parsed.error.issues,
        );
      }

      const { error } = await supabase.from('tenants').update(parsed.data).eq('id', tenantId);

      if (error) {
        throw new ServiceError('Failed to update tenant brand', 'INTERNAL', error);
      }

      return { success: true };
    },
  };
}
