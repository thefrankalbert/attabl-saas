import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';

interface AnnouncementPayload {
  title: string;
  description?: string | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
}

/**
 * Announcement service - handles announcement CRUD operations.
 *
 * Used by AnnouncementsClient.
 */
export function createAnnouncementService(supabase: SupabaseClient) {
  return {
    /**
     * Create a new announcement. Returns the created announcement.
     */
    async createAnnouncement(tenantId: string, data: AnnouncementPayload): Promise<unknown> {
      const { data: announcement, error } = await supabase
        .from('announcements')
        .insert({ tenant_id: tenantId, ...data })
        .select()
        .single();

      if (error) {
        throw new ServiceError("Erreur lors de la creation de l'annonce", 'INTERNAL', error);
      }
      return announcement;
    },

    /**
     * Update an existing announcement. Returns the updated announcement.
     */
    async updateAnnouncement(announcementId: string, data: AnnouncementPayload): Promise<unknown> {
      const { data: announcement, error } = await supabase
        .from('announcements')
        .update(data)
        .eq('id', announcementId)
        .select()
        .single();

      if (error) {
        throw new ServiceError("Erreur lors de la mise a jour de l'annonce", 'INTERNAL', error);
      }
      return announcement;
    },

    /**
     * Delete an announcement by ID.
     */
    async deleteAnnouncement(announcementId: string): Promise<void> {
      const { error } = await supabase.from('announcements').delete().eq('id', announcementId);

      if (error) {
        throw new ServiceError("Erreur lors de la suppression de l'annonce", 'INTERNAL', error);
      }
    },

    /**
     * Toggle the is_active flag on an announcement. Returns the updated announcement.
     */
    async toggleActive(announcementId: string, isActive: boolean): Promise<unknown> {
      const { data, error } = await supabase
        .from('announcements')
        .update({ is_active: isActive })
        .eq('id', announcementId)
        .select()
        .single();

      if (error) {
        throw new ServiceError("Erreur lors de la mise a jour de l'annonce", 'INTERNAL', error);
      }
      return data;
    },
  };
}
