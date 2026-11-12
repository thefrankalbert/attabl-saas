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
  listVisibleAnnouncements(tenantId: string, now?: Date): Promise<VisibleAnnouncement[]>;
}

export type VisibleAnnouncement = Pick<Announcement, 'id' | 'title' | 'description'>;

const DAY_MS = 24 * 60 * 60 * 1000;

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

    /**
     * Announcements a customer must see right now on the storefront: active,
     * started, not yet over. The admin form stores a date-only end day at
     * 00:00 UTC, so the end day counts as a whole day (an announcement ending
     * "Monday" is still shown on Monday). Errors return an empty list: a
     * missing banner must never break the menu.
     */
    async listVisibleAnnouncements(
      tenantId: string,
      now: Date = new Date(),
    ): Promise<VisibleAnnouncement[]> {
      const endCutoff = new Date(now.getTime() - DAY_MS).toISOString();
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, description')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .lte('start_date', now.toISOString())
        .or(`end_date.is.null,end_date.gt.${endCutoff}`)
        .order('start_date', { ascending: false })
        .limit(3);

      if (error) return [];
      return (data ?? []) as VisibleAnnouncement[];
    },
  };
}
