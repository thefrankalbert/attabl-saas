// --- Supplier Types -------------------------------------

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierInput {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface UpdateSupplierInput {
  name?: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

// --- Supplier Excel import ------------------------------

import type { ImportRowError } from '@/lib/excel-parse';

/** One validated supplier row parsed from an Excel sheet. */
export interface ParsedSupplierRow {
  rowNumber: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  // null = column absent / cell empty -> leave existing value untouched on update.
  is_active: boolean | null;
}

/** Result of a supplier Excel import (merge/upsert by lower(name) per tenant). */
export interface SupplierImportResult {
  suppliersCreated: number;
  suppliersUpdated: number;
  suppliersSkipped: number;
  errors: ImportRowError[];
}
