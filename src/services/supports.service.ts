import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { ChevaletConfig } from '@/types/supports.types';

export function createSupportsService(supabase: SupabaseClient) {
  return {
    async getConfig(tenantId: string): Promise<ChevaletConfig | null> {
      const { data, error } = await supabase
        .from('tenant_supports')
        .select('config')
        .eq('tenant_id', tenantId)
        .eq('type', 'chevalet_standard')
        .maybeSingle();

      if (error) throw new ServiceError('Failed to load chevalet config', 'INTERNAL');
      return data ? (data.config as ChevaletConfig) : null;
    },

    async saveConfig(tenantId: string, config: ChevaletConfig): Promise<void> {
      const { error } = await supabase
        .from('tenant_supports')
        .upsert(
          {
            tenant_id: tenantId,
            type: 'chevalet_standard',
            config,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,type' },
        );

      if (error) throw new ServiceError('Failed to save chevalet config', 'INTERNAL');
    },
  };
}
