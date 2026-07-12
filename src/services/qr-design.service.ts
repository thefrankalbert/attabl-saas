import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { createDefaultQRDesignConfig, type QRDesignConfig } from '@/types/qr-design.types';
import { qrDesignConfigSchema, type SaveQrDesignInput } from '@/lib/validations/qr-design.schema';

/** Upper bound on saved QR designs per tenant (anti-abuse, SEC-02). */
const MAX_DESIGNS_PER_TENANT = 50;

export interface QrDesignRow {
  id: string;
  tenant_id: string;
  name: string;
  config: QRDesignConfig;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface QrDesignService {
  listDesigns(tenantId: string): Promise<QrDesignRow[]>;
  getDefaultDesign(tenantId: string): Promise<QrDesignRow | null>;
  saveDesign(tenantId: string, input: SaveQrDesignInput): Promise<QrDesignRow>;
  deleteDesign(tenantId: string, id: string): Promise<void>;
  assignDesignToZone(tenantId: string, zoneId: string, designId: string | null): Promise<void>;
  assignDesignToTable(tenantId: string, tableId: string, designId: string | null): Promise<void>;
  resolveDesignForTable(tenantId: string, tableId: string): Promise<QRDesignConfig>;
}

/**
 * Parse a stored jsonb config back into a typed QRDesignConfig. Because the
 * column is jsonb, an older/hand-edited row could hold an incompatible shape,
 * so we validate and fall back to the factory default rather than trust it.
 */
function parseConfig(raw: unknown, fallback: QRDesignConfig): QRDesignConfig {
  const parsed = qrDesignConfigSchema.safeParse(raw);
  return parsed.success ? (parsed.data as QRDesignConfig) : fallback;
}

function toRow(row: {
  id: string;
  tenant_id: string;
  name: string;
  config: unknown;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}): QrDesignRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    is_default: row.is_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
    config: parseConfig(row.config, createDefaultQRDesignConfig('#000000')),
  };
}

export function createQrDesignService(supabase: SupabaseClient): QrDesignService {
  async function tenantDefaultConfig(tenantId: string): Promise<QRDesignConfig> {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('primary_color, secondary_color')
      .eq('id', tenantId)
      .maybeSingle();
    const factory = createDefaultQRDesignConfig(tenant?.primary_color || '#000000');

    const { data: def } = await supabase
      .from('qr_designs')
      .select('config')
      .eq('tenant_id', tenantId)
      .eq('is_default', true)
      .maybeSingle();

    return def ? parseConfig(def.config, factory) : factory;
  }

  /** Verify a design id belongs to the tenant before assigning it. */
  async function assertDesignOwned(tenantId: string, designId: string): Promise<void> {
    const { data, error } = await supabase
      .from('qr_designs')
      .select('id')
      .eq('id', designId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw new ServiceError('Erreur lors de la verification du design', 'INTERNAL');
    if (!data) throw new ServiceError('Design QR introuvable', 'NOT_FOUND');
  }

  return {
    async listDesigns(tenantId) {
      const { data, error } = await supabase
        .from('qr_designs')
        .select('id, tenant_id, name, config, is_default, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      if (error) throw new ServiceError('Erreur lors du chargement des designs', 'INTERNAL');
      return (data ?? []).map(toRow);
    },

    async getDefaultDesign(tenantId) {
      const { data, error } = await supabase
        .from('qr_designs')
        .select('id, tenant_id, name, config, is_default, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .maybeSingle();
      if (error) throw new ServiceError('Erreur lors du chargement du design', 'INTERNAL');
      return data ? toRow(data) : null;
    },

    async saveDesign(tenantId, input) {
      // Defense-in-depth: re-validate the config even though the action already did.
      if (!qrDesignConfigSchema.safeParse(input.config).success) {
        throw new ServiceError('Configuration QR invalide', 'VALIDATION');
      }

      // A tenant keeps at most one default design (partial unique index enforces
      // it too). Clear the others first so the write never violates the index.
      if (input.isDefault) {
        const clear = supabase
          .from('qr_designs')
          .update({ is_default: false })
          .eq('tenant_id', tenantId);
        const { error: clearErr } = input.id ? await clear.neq('id', input.id) : await clear;
        if (clearErr) throw new ServiceError('Erreur lors de la mise a jour', 'INTERNAL');
      }

      if (input.id) {
        const { data, error } = await supabase
          .from('qr_designs')
          .update({ name: input.name, config: input.config, is_default: input.isDefault })
          .eq('id', input.id)
          .eq('tenant_id', tenantId)
          .select('id, tenant_id, name, config, is_default, created_at, updated_at')
          .maybeSingle();
        if (error) throw new ServiceError("Erreur lors de l'enregistrement", 'INTERNAL');
        if (!data) throw new ServiceError('Design QR introuvable', 'NOT_FOUND');
        return toRow(data);
      }

      // Per-tenant cap: bound unbounded design creation (SEC-02).
      const { count, error: countError } = await supabase
        .from('qr_designs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
      if (countError) throw new ServiceError("Erreur lors de l'enregistrement", 'INTERNAL');
      if ((count ?? 0) >= MAX_DESIGNS_PER_TENANT) {
        throw new ServiceError(
          `Limite de ${MAX_DESIGNS_PER_TENANT} designs QR atteinte`,
          'VALIDATION',
        );
      }

      const { data, error } = await supabase
        .from('qr_designs')
        .insert({
          tenant_id: tenantId,
          name: input.name,
          config: input.config,
          is_default: input.isDefault,
        })
        .select('id, tenant_id, name, config, is_default, created_at, updated_at')
        .single();
      if (error) throw new ServiceError("Erreur lors de l'enregistrement", 'INTERNAL');
      return toRow(data);
    },

    async deleteDesign(tenantId, id) {
      const { error } = await supabase
        .from('qr_designs')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw new ServiceError('Erreur lors de la suppression', 'INTERNAL');
    },

    async assignDesignToZone(tenantId, zoneId, designId) {
      if (designId) await assertDesignOwned(tenantId, designId);
      const { error } = await supabase
        .from('zones')
        .update({ qr_design_id: designId })
        .eq('id', zoneId)
        .eq('tenant_id', tenantId);
      if (error) throw new ServiceError("Erreur lors de l'assignation", 'INTERNAL');
    },

    async assignDesignToTable(tenantId, tableId, designId) {
      if (designId) await assertDesignOwned(tenantId, designId);
      const { error } = await supabase
        .from('tables')
        .update({ qr_design_id: designId })
        .eq('id', tableId)
        .eq('tenant_id', tenantId);
      if (error) throw new ServiceError("Erreur lors de l'assignation", 'INTERNAL');
    },

    async resolveDesignForTable(tenantId, tableId) {
      const { data: table } = await supabase
        .from('tables')
        .select('qr_design_id, zone_id')
        .eq('id', tableId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const fallback = await tenantDefaultConfig(tenantId);

      // Resolution order: table -> zone -> tenant default (already in fallback).
      let designId: string | null = table?.qr_design_id ?? null;

      if (!designId && table?.zone_id) {
        const { data: zone } = await supabase
          .from('zones')
          .select('qr_design_id')
          .eq('id', table.zone_id)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        designId = zone?.qr_design_id ?? null;
      }

      if (!designId) return fallback;

      const { data: design } = await supabase
        .from('qr_designs')
        .select('config')
        .eq('id', designId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      return design ? parseConfig(design.config, fallback) : fallback;
    },
  };
}
