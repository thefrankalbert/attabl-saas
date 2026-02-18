'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

interface TenantSettings {
  id: string;
  slug: string;
  name: string;
  currency: string;
  [key: string]: unknown;
}

/**
 * Fetch tenant settings by ID.
 */
export function useTenantSettings(tenantId: string) {
  return useQuery<TenantSettings | null>({
    queryKey: ['tenant-settings', tenantId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

      if (error) throw error;
      return data as TenantSettings;
    },
    enabled: !!tenantId,
  });
}
