import type { SupabaseClient } from '@supabase/supabase-js';
import type { Ad } from '@/types/admin.types';
import { ServiceError } from './errors';

interface CreateAdInput {
  tenant_id: string;
  image_url: string;
  link?: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface AdService {
  createAd(data: CreateAdInput): Promise<Ad>;
  deleteAd(adId: string, tenantId: string): Promise<void>;
  toggleActive(adId: string, isActive: boolean, tenantId: string): Promise<Ad>;
}

/**
 * Ad service - handles ad banner CRUD operations.
 *
 * Used by AdsClient.
 */
export function createAdService(supabase: SupabaseClient): AdService {
  return {
    /**
     * Create a new ad banner. Returns the created ad.
     */
    async createAd(data: CreateAdInput): Promise<Ad> {
      const { data: ad, error } = await supabase.from('ads').insert(data).select().single();

      if (error) {
        throw new ServiceError("Erreur lors de la creation de l'annonce", 'INTERNAL', error);
      }
      return ad as Ad;
    },

    /**
     * Delete an ad banner by ID, scoped to tenant.
     */
    async deleteAd(adId: string, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('ads')
        .delete()
        .eq('id', adId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError("Erreur lors de la suppression de l'annonce", 'INTERNAL', error);
      }
    },

    /**
     * Toggle the is_active flag on an ad banner, scoped to tenant. Returns the updated ad.
     */
    async toggleActive(adId: string, isActive: boolean, tenantId: string): Promise<Ad> {
      const { data, error } = await supabase
        .from('ads')
        .update({ is_active: isActive })
        .eq('id', adId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) {
        throw new ServiceError("Erreur lors de la mise a jour de l'annonce", 'INTERNAL', error);
      }
      return data as Ad;
    },
  };
}
