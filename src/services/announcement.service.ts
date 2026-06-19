import type { SupabaseClient } from '@supabase/supabase-js';
import type { Announcement } from '@/types/admin.types';
import { ServiceError } from './errors';

interface AnnouncementPayload {
  title: string;
  description?: string | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
}

export interface AnnouncementService {
  createAnnouncement(tenantId: string, data: AnnouncementPayload): Promise<Announcement>;
  updateAnnouncement(
    announcementId: string,
    tenantId: string,
    data: AnnouncementPayload,
  ): Promise<Announcement>;
  deleteAnnouncement(announcementId: string, tenantId: string): Promise<void>;
  toggleActive(announcementId: string, isActive: boolean, tenantId: string): Promise<Announcement>;
}

/**
 * Announcement service - handles announcement CRUD operations.
 *
 * Used by AnnouncementsClient.
 */
export function createAnnouncementService(supabase: SupabaseClient): AnnouncementService {
  return {
    /**
     * Create a new announcement. Returns the created announcement.
     */
    async createAnnouncement(tenantId: string, data: AnnouncementPayload): Promise<Announcement> {
      const { data: announcement, error } = await supabase
        .from('announcements')
        .insert({ tenant_id: tenantId, ...data })
        .select()
        .single();

      if (error) {
        throw new ServiceError("Erreur lors de la creation de l'annonce", 'INTERNAL', error);
      }
      return announcement as Announcement;
    },

    /**
     * Update an existing announcement, scoped to tenant. Returns the updated announcement.
     */
    async updateAnnouncement(
      announcementId: string,
      tenantId: string,
      data: AnnouncementPayload,
    ): Promise<Announcement> {
      const { data: announcement, error } = await supabase
        .from('announcements')
        .update(data)
        .eq('id', announcementId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) {
        throw new ServiceError("Erreur lors de la mise a jour de l'annonce", 'INTERNAL', error);
      }
      return announcement as Announcement;
    },

    /**
     * Delete an announcement scoped to tenant.
     */
    async deleteAnnouncement(announcementId: string, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', announcementId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError("Erreur lors de la suppression de l'annonce", 'INTERNAL', error);
      }
    },

    /**
     * Toggle the is_active flag on an announcement, scoped to tenant. Returns the updated announcement.
     */
    async toggleActive(
      announcementId: string,
      isActive: boolean,
      tenantId: string,
    ): Promise<Announcement> {
      const { data, error } = await supabase
        .from('announcements')
        .update({ is_active: isActive })
        .eq('id', announcementId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) {
        throw new ServiceError("Erreur lors de la mise a jour de l'annonce", 'INTERNAL', error);
      }
      return data as Announcement;
    },
  };
}
