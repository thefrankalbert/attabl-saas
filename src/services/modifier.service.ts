import type { SupabaseClient } from '@supabase/supabase-js';
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

/**
 * Modifier service - handles item modifier CRUD operations.
 *
 * Used by ItemModifierEditor.
 */
export function createModifierService(supabase: SupabaseClient) {
  return {
    /**
     * Create a new item modifier. Returns the created modifier.
     */
    async createModifier(data: CreateModifierInput): Promise<unknown> {
      const { data: modifier, error } = await supabase
        .from('item_modifiers')
        .insert(data)
        .select()
        .single();

      if (error) {
        throw new ServiceError('Erreur lors de la creation du modificateur', 'INTERNAL', error);
      }
      return modifier;
    },

    /**
     * Delete an item modifier by ID.
     */
    async deleteModifier(modifierId: string): Promise<void> {
      const { error } = await supabase.from('item_modifiers').delete().eq('id', modifierId);

      if (error) {
        throw new ServiceError('Erreur lors de la suppression du modificateur', 'INTERNAL', error);
      }
    },

    /**
     * Toggle availability of an item modifier.
     */
    async toggleAvailable(modifierId: string, isAvailable: boolean): Promise<void> {
      const { error } = await supabase
        .from('item_modifiers')
        .update({ is_available: isAvailable })
        .eq('id', modifierId);

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
