/**
 * Supplier Service — CRUD operations for suppliers
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from '@/services/errors';
import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from '@/types/supplier.types';

export function createSupplierService(supabase: SupabaseClient) {
  return {
    async getSuppliers(tenantId: string): Promise<Supplier[]> {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name');

      if (error) throw new ServiceError('Erreur chargement fournisseurs', 'INTERNAL', error);
      return (data as Supplier[]) || [];
    },

    async getActiveSuppliers(tenantId: string): Promise<Supplier[]> {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name');

      if (error) throw new ServiceError('Erreur chargement fournisseurs', 'INTERNAL', error);
      return (data as Supplier[]) || [];
    },

    async createSupplier(tenantId: string, input: CreateSupplierInput): Promise<Supplier> {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          tenant_id: tenantId,
          name: input.name,
          contact_name: input.contact_name || null,
          phone: input.phone || null,
          email: input.email || null,
          address: input.address || null,
          notes: input.notes || null,
        })
        .select()
        .single();

      if (error) throw new ServiceError('Erreur création fournisseur', 'INTERNAL', error);
      return data as Supplier;
    },

    async updateSupplier(
      supplierId: string,
      tenantId: string,
      input: UpdateSupplierInput,
    ): Promise<Supplier> {
      const { data, error } = await supabase
        .from('suppliers')
        .update(input)
        .eq('id', supplierId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw new ServiceError('Erreur mise à jour fournisseur', 'INTERNAL', error);
      return data as Supplier;
    },

    async deleteSupplier(supplierId: string, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', supplierId)
        .eq('tenant_id', tenantId);

      if (error) throw new ServiceError('Erreur suppression fournisseur', 'INTERNAL', error);
    },
  };
}
