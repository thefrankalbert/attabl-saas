import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import { createDefaultQRDesignConfig, type QRDesignConfig } from '@/types/qr-design.types';
import { qrDesignConfigSchema, type SaveQrDesignInput } from '@/lib/validations/qr-design.schema';

/** Upper bound on saved QR designs per tenant (anti-abuse, SEC-02). */
const MAX_DESIGNS_PER_TENANT = 50;

interface QrDesignRow {
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
  assignDesignToZone(tenantId: string, zoneId: string, designId: string | null): Promise<void>;
  assignDesignToTable(tenantId: string, tableId: string, designId: string | null): Promise<void>;
  resolveDesignsForTables(
    tenantId: string,
    tableIds: string[],
  ): Promise<Record<string, QRDesignConfig>>;
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
    // Audit B81: une lecture en echec ne doit pas retomber en silence sur le
    // design d'usine: les cartes seraient imprimees avec le mauvais design.
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('primary_color, secondary_color')
      .eq('id', tenantId)
      .maybeSingle();
    if (tenantErr) {
      logger.error('QR design: tenant read failed', { tenantId, error: tenantErr.message });
      throw new ServiceError('Erreur lors du chargement du design par defaut', 'INTERNAL');
    }
    const factory = createDefaultQRDesignConfig(tenant?.primary_color || '#000000');

    const { data: def, error: defErr } = await supabase
      .from('qr_designs')
      .select('config')
      .eq('tenant_id', tenantId)
      .eq('is_default', true)
      .maybeSingle();
    if (defErr) {
      logger.error('QR design: default design read failed', { tenantId, error: defErr.message });
      throw new ServiceError('Erreur lors du chargement du design par defaut', 'INTERNAL');
    }

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

      // Plafond et existence AVANT d'effacer le defaut: sinon un refus (plafond
      // atteint, design disparu) laissait le restaurant sans design par defaut,
      // en silence (revue L013, A10).
      if (input.id) {
        const { data: existing, error: existErr } = await supabase
          .from('qr_designs')
          .select('id')
          .eq('id', input.id)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (existErr) throw new ServiceError("Erreur lors de l'enregistrement", 'INTERNAL');
        if (!existing) throw new ServiceError('Design QR introuvable', 'NOT_FOUND');
      } else {
        // Per-tenant cap: bound unbounded design creation (SEC-02).
        // ponytail: check-then-insert has a TOCTOU race - two concurrent saves at
        // count=49 can both insert (51). Acceptable: this is an anti-abuse ceiling
        // (not a security boundary), bounded by uploadLimiter (20/min). If it must
        // be hard, add a partial unique index / row_number trigger on tenant_id.
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

    async assignDesignToZone(tenantId, zoneId, designId) {
      if (designId) await assertDesignOwned(tenantId, designId);
      const { data, error } = await supabase
        .from('zones')
        .update({ qr_design_id: designId })
        .eq('id', zoneId)
        .eq('tenant_id', tenantId)
        .select('id');
      if (error) throw new ServiceError("Erreur lors de l'assignation", 'INTERNAL');
      // Zero ligne = zone supprimee ou d'un autre restaurant: ne pas annoncer
      // une assignation qui n'a pas eu lieu (revue L013, A11).
      if (!data || data.length === 0) throw new ServiceError('Zone introuvable', 'NOT_FOUND');
    },

    async assignDesignToTable(tenantId, tableId, designId) {
      if (designId) await assertDesignOwned(tenantId, designId);
      const { data, error } = await supabase
        .from('tables')
        .update({ qr_design_id: designId })
        .eq('id', tableId)
        .eq('tenant_id', tenantId)
        .select('id');
      if (error) throw new ServiceError("Erreur lors de l'assignation", 'INTERNAL');
      if (!data || data.length === 0) throw new ServiceError('Table introuvable', 'NOT_FOUND');
    },

    async resolveDesignsForTables(tenantId, tableIds) {
      // Resolution groupee (revue L013, A9): un nombre FIXE de requetes quel que
      // soit le nombre de tables, au lieu de 3 a 5 requetes par table.
      // Ordre: table -> zone -> defaut du restaurant (deja dans `fallback`).
      const fallback = await tenantDefaultConfig(tenantId);
      // Une Map, pas un objet indexe par une valeur fournie par l'appelant: un
      // identifiant comme "__proto__" ne peut pas toucher le prototype.
      const resolved = new Map<string, QRDesignConfig>();
      for (const id of tableIds) resolved.set(id, fallback);
      if (tableIds.length === 0) return Object.fromEntries(resolved);

      const { data: tables, error: tablesErr } = await supabase
        .from('tables')
        .select('id, qr_design_id, zone_id')
        .eq('tenant_id', tenantId)
        .in('id', tableIds);
      if (tablesErr) throw new ServiceError('Erreur lors du chargement des tables', 'INTERNAL');
      const tableRows = (tables ?? []) as Array<{
        id: string;
        qr_design_id: string | null;
        zone_id: string | null;
      }>;

      const zoneIds = [
        ...new Set(
          tableRows.filter((t) => !t.qr_design_id && t.zone_id).map((t) => t.zone_id as string),
        ),
      ];
      const zoneDesign = new Map<string, string | null>();
      if (zoneIds.length > 0) {
        const { data: zones, error: zonesErr } = await supabase
          .from('zones')
          .select('id, qr_design_id')
          .eq('tenant_id', tenantId)
          .in('id', zoneIds);
        if (zonesErr) throw new ServiceError('Erreur lors du chargement des zones', 'INTERNAL');
        for (const z of (zones ?? []) as Array<{ id: string; qr_design_id: string | null }>) {
          zoneDesign.set(z.id, z.qr_design_id);
        }
      }

      const designOf = new Map<string, string>();
      for (const t of tableRows) {
        const designId = t.qr_design_id ?? (t.zone_id ? zoneDesign.get(t.zone_id) : null) ?? null;
        if (designId) designOf.set(t.id, designId);
      }

      const designIds = [...new Set(designOf.values())];
      if (designIds.length === 0) return Object.fromEntries(resolved);
      const { data: designs, error: designsErr } = await supabase
        .from('qr_designs')
        .select('id, config')
        .eq('tenant_id', tenantId)
        .in('id', designIds);
      if (designsErr) throw new ServiceError('Erreur lors du chargement des designs', 'INTERNAL');
      const configOf = new Map<string, QRDesignConfig>();
      for (const d of (designs ?? []) as Array<{ id: string; config: unknown }>) {
        configOf.set(d.id, parseConfig(d.config, fallback));
      }
      for (const [tableId, designId] of designOf) {
        resolved.set(tableId, configOf.get(designId) ?? fallback);
      }
      return Object.fromEntries(resolved);
    },
  };
}
