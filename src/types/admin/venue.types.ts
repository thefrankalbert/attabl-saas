// Types multi-venue (venues, zones, tables) pour l'administration multi-tenant ATTABL SaaS

import type { AdminUser } from './tenant.types';

// --- Multi-venue -------------------------------------------

export interface Venue {
  id: string;
  tenant_id: string;
  name: string;
  name_en?: string;
  slug: string;
  description?: string;
  description_en?: string;
  image_url?: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface Zone {
  id: string;
  venue_id: string;
  name: string;
  name_en?: string;
  prefix: string;
  description?: string;
  display_order: number;
  created_at: string;
}

export interface Table {
  id: string;
  zone_id: string;
  table_number: string;
  display_name: string;
  capacity: number;
  is_active: boolean;
  qr_code_url?: string;
  created_at: string;
  zone?: Zone;
}

export interface TableAssignment {
  id: string;
  tenant_id: string;
  table_id: string;
  server_id: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  // Joins
  server?: AdminUser;
  table?: Table;
}
