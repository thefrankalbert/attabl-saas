import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import {
  mapHeaders,
  parseBooleanCell,
  readFirstSheetRows,
  isEmptyRow,
  type ImportRowError,
} from '@/lib/excel-parse';
import type { ParsedSupplierRow, SupplierImportResult } from '@/types/supplier.types';

// --- Column aliases (tolerant FR / EN, accents/spacing stripped) --

const SUPPLIER_ALIASES: Record<string, string[]> = {
  name: [
    'name',
    'nom',
    'supplier',
    'suppliername',
    'fournisseur',
    'nomfournisseur',
    'raisonsociale',
  ],
  contact_name: [
    'contact',
    'contactname',
    'contactperson',
    'personnecontact',
    'nomcontact',
    'responsable',
  ],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'numero', 'numerotelephone', 'contactphone'],
  email: ['email', 'e-mail', 'courriel', 'mail', 'adresseemail', 'contactemail'],
  address: ['address', 'adresse', 'addresse', 'lieu'],
  notes: ['notes', 'note', 'remarque', 'remarques', 'commentaire', 'commentaires'],
  is_active: ['active', 'actif', 'isactive', 'estactif', 'statut', 'status', 'enabled'],
};

// --- Row validation schema --------------------------------

const supplierRowSchema = z.object({
  name: z
    .string({ error: 'Le nom du fournisseur est requis' })
    .min(1, 'Le nom du fournisseur est requis')
    .max(200, 'Le nom doit faire 200 caracteres ou moins'),
  contact_name: z.string().max(200).nullable(),
  // phone kept lenient (formats vary): length-bounded string only.
  phone: z.string().max(50, 'Le telephone doit faire 50 caracteres ou moins').nullable(),
  // email is optional; when provided it must be a valid address (else row error).
  email: z.string().email('Email invalide').max(255).nullable(),
  address: z.string().max(500).nullable(),
  notes: z.string().max(1000).nullable(),
  is_active: z.boolean().nullable(),
});

function cellToTrimmedStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

// --- Service ----------------------------------------------

export interface SupplierImportService {
  parseExcel(buffer: ArrayBuffer): Promise<{ rows: ParsedSupplierRow[]; errors: ImportRowError[] }>;
  importFromExcel(tenantId: string, buffer: ArrayBuffer): Promise<SupplierImportResult>;
  generateTemplate(): Promise<Buffer>;
}

/**
 * Supplier Excel import service.
 *
 * MERGE (upsert) by lower(name) per tenant: existing suppliers are UPDATED with
 * the provided fields, unknown names are INSERTED. Never deletes. Follows the DI
 * pattern (receives a SupabaseClient) so it can be unit-tested with a mock.
 */
export function createSupplierImportService(supabase: SupabaseClient): SupplierImportService {
  return {
    async parseExcel(
      buffer: ArrayBuffer,
    ): Promise<{ rows: ParsedSupplierRow[]; errors: ImportRowError[] }> {
      let rawData: unknown[][];
      try {
        rawData = await readFirstSheetRows(buffer);
      } catch {
        throw new ServiceError('Le fichier Excel ne contient aucune feuille', 'VALIDATION');
      }

      if (rawData.length < 2) {
        throw new ServiceError(
          'Le fichier Excel doit contenir une ligne d en-tete et au moins une ligne de donnees',
          'VALIDATION',
        );
      }

      const headerRow = (rawData[0] as unknown[]).map((c) => (c == null ? '' : String(c)));
      const headerMapping = mapHeaders(SUPPLIER_ALIASES, headerRow);
      const mappedFields = new Set(headerMapping.values());

      if (!mappedFields.has('name')) {
        throw new ServiceError(
          'Colonne obligatoire manquante : Nom (Name). Colonnes attendues : Nom, Contact, Telephone, Email, Adresse, Notes, Actif',
          'VALIDATION',
        );
      }

      const rows: ParsedSupplierRow[] = [];
      const errors: ImportRowError[] = [];

      for (let i = 1; i < rawData.length; i++) {
        const cells = rawData[i] as unknown[];
        if (isEmptyRow(cells)) continue;

        const rowNumber = i + 1; // 1-based, matches what the user sees in Excel.

        const rawRow: Record<string, unknown> = {};
        for (const [colIndex, fieldName] of headerMapping.entries()) {
          rawRow[fieldName] = cells[colIndex] ?? null;
        }

        const rowToValidate = {
          name: rawRow.name != null ? String(rawRow.name).trim() : '',
          contact_name: cellToTrimmedStringOrNull(rawRow.contact_name),
          phone: cellToTrimmedStringOrNull(rawRow.phone),
          email: cellToTrimmedStringOrNull(rawRow.email),
          address: cellToTrimmedStringOrNull(rawRow.address),
          notes: cellToTrimmedStringOrNull(rawRow.notes),
          is_active: mappedFields.has('is_active')
            ? rawRow.is_active == null || String(rawRow.is_active).trim() === ''
              ? null
              : parseBooleanCell(rawRow.is_active, true)
            : null,
        };

        const result = supplierRowSchema.safeParse(rowToValidate);
        if (!result.success) {
          const messages = result.error.issues.map((issue) => issue.message).join('; ');
          errors.push({ row: rowNumber, message: messages });
          continue;
        }

        rows.push({ rowNumber, ...result.data });
      }

      return { rows, errors };
    },

    async importFromExcel(tenantId: string, buffer: ArrayBuffer): Promise<SupplierImportResult> {
      logger.info('Starting Excel supplier import', { tenantId });

      const { rows, errors: parseErrors } = await this.parseExcel(buffer);

      if (rows.length === 0) {
        return {
          suppliersCreated: 0,
          suppliersUpdated: 0,
          suppliersSkipped: parseErrors.length,
          errors: parseErrors,
        };
      }

      // Load existing suppliers ONCE (tenant-scoped) to dedup by lower(name).
      const { data: existing, error: loadError } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('tenant_id', tenantId);

      if (loadError) {
        throw new ServiceError('Erreur chargement fournisseurs existants', 'INTERNAL', loadError);
      }

      const idByLowerName = new Map<string, string>();
      for (const s of (existing as { id: string; name: string }[]) ?? []) {
        idByLowerName.set(s.name.toLowerCase(), s.id);
      }

      const errors: ImportRowError[] = [...parseErrors];
      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const key = row.name.toLowerCase();
        const existingId = idByLowerName.get(key);

        if (existingId) {
          // Update: only the fields actually provided in the sheet.
          const update: Record<string, unknown> = {};
          if (row.contact_name !== null) update.contact_name = row.contact_name;
          if (row.phone !== null) update.phone = row.phone;
          if (row.email !== null) update.email = row.email;
          if (row.address !== null) update.address = row.address;
          if (row.notes !== null) update.notes = row.notes;
          if (row.is_active !== null) update.is_active = row.is_active;

          if (Object.keys(update).length === 0) {
            updated += 1;
            continue;
          }

          const { error } = await supabase
            .from('suppliers')
            .update(update)
            .eq('id', existingId)
            .eq('tenant_id', tenantId);

          if (error) {
            errors.push({ row: row.rowNumber, message: 'Erreur de mise a jour du fournisseur' });
            continue;
          }
          updated += 1;
        } else {
          const { data: inserted, error } = await supabase
            .from('suppliers')
            .insert({
              tenant_id: tenantId,
              name: row.name,
              contact_name: row.contact_name,
              phone: row.phone,
              email: row.email,
              address: row.address,
              notes: row.notes,
              ...(row.is_active !== null ? { is_active: row.is_active } : {}),
            })
            .select('id')
            .single();

          if (error || !inserted) {
            errors.push({ row: row.rowNumber, message: 'Erreur de creation du fournisseur' });
            continue;
          }
          // Dedup within the same file: a later row with the same name updates.
          idByLowerName.set(key, (inserted as { id: string }).id);
          created += 1;
        }
      }

      return {
        suppliersCreated: created,
        suppliersUpdated: updated,
        suppliersSkipped: errors.length,
        errors,
      };
    },

    async generateTemplate(): Promise<Buffer> {
      const { buildStyledWorkbook } = await import('@/lib/exports/styled-workbook');
      return buildStyledWorkbook({
        sheetName: 'Suppliers',
        title: 'Import fournisseurs - ATTABL',
        subtitle: 'Une ligne par fournisseur. Ne pas modifier les en-tetes.',
        columns: [
          { header: 'Name', width: 24 },
          { header: 'Contact', width: 20 },
          { header: 'Phone', width: 18 },
          { header: 'Email', width: 26 },
          { header: 'Address', width: 28 },
          { header: 'Notes', width: 24 },
          { header: 'Active', width: 10 },
        ],
        rows: [
          [
            'Boulangerie du Marche',
            'Amadou Diallo',
            '+225 07 00 00 00',
            'contact@boulangerie.ci',
            'Rue du Commerce, Abidjan',
            'Livraison le lundi',
            'Oui',
          ],
          [
            'Grossiste Boissons',
            'Fatou Kone',
            '+221 77 000 00 00',
            'ventes@boissons.sn',
            'Dakar',
            '',
            'Oui',
          ],
        ],
      });
    },
  };
}
