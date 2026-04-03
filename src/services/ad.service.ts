import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';

interface CreateAdInput {
  tenant_id: string;
  image_url: string;
  link?: string | null;
  sort_order: number;
  is_active: boolean;
}

/**
 * Ad service - handles ad banner CRUD operations.
 *
 * Used by AdsClient.
 */
export function createAdService(supabase: SupabaseClient) {
  return {
    /**
     * Create a new ad banner. Returns the created ad.
     */
    async createAd(data: CreateAdInput): Promise<unknown> {
      const { data: ad, error } = await supabase.from('ads').insert(data).select().single();

      if (error) {
        throw new ServiceError("Erreur lors de la creation de l'annonce", 'INTERNAL', error);
      }
      return ad;
    },

    /**
     * Delete an ad banner by ID.
     */
    async deleteAd(adId: string): Promise<void> {
      const { error } = await supabase.from('ads').delete().eq('id', adId);

      if (error) {
        throw new ServiceError("Erreur lors de la suppression de l'annonce", 'INTERNAL', error);
      }
    },

    /**
     * Toggle the is_active flag on an ad banner. Returns the updated ad.
     */
    async toggleActive(adId: string, isActive: boolean): Promise<unknown> {
      const { data, error } = await supabase
        .from('ads')
        .update({ is_active: isActive })
        .eq('id', adId)
        .select()
        .single();

      if (error) {
        throw new ServiceError("Erreur lors de la mise a jour de l'annonce", 'INTERNAL', error);
      }
      return data;
    },
  };
}
