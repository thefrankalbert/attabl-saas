import type { SupabaseClient } from '@supabase/supabase-js';
import type { ItemModifier } from '@/types/admin.types';
import { ServiceError } from './errors';

interface CreateModifierInput {
  tenant_id: string;
  menu_item_id: string;
  name: string;
  name_en?: string | null;
  price: number;
  is_available: boolean;
  display_order: number;
}

export interface ModifierService {
  createModifier(data: CreateModifierInput): Promise<ItemModifier>;
  deleteModifier(modifierId: string, tenantId: string): Promise<void>;
  toggleAvailable(modifierId: string, isAvailable: boolean, tenantId: string): Promise<void>;
}

/**
 * Modifier service - handles item modifier CRUD operations.
 *
 * Used by ItemModifierEditor.
 */
export function createModifierService(supabase: SupabaseClient): ModifierService {
  return {
    /**
     * Create a new item modifier. Returns the created modifier.
     */
    async createModifier(data: CreateModifierInput): Promise<ItemModifier> {
      const { data: modifier, error } = await supabase
        .from('item_modifiers')
        .insert(data)
        .select()
        .single();

      if (error) {
        throw new ServiceError('Erreur lors de la creation du modificateur', 'INTERNAL', error);
      }
      return modifier as ItemModifier;
    },

    /**
     * Delete an item modifier by ID, scoped to tenant.
     */
    async deleteModifier(modifierId: string, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('item_modifiers')
        .delete()
        .eq('id', modifierId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la suppression du modificateur', 'INTERNAL', error);
      }
    },

    /**
     * Toggle availability of an item modifier, scoped to tenant.
     */
    async toggleAvailable(
      modifierId: string,
      isAvailable: boolean,
      tenantId: string,
    ): Promise<void> {
      const { error } = await supabase
        .from('item_modifiers')
        .update({ is_available: isAvailable })
        .eq('id', modifierId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError(
          'Erreur lors du changement de disponibilite du modificateur',
          'INTERNAL',
          error,
        );
      }
    },
  };
}
