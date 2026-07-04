// Shared types for the tables settings surface (zones + tables)

export interface Zone {
  id: string;
  name: string;
  prefix: string;
  venue_id: string;
  display_order: number;
}

export interface Table {
  id: string;
  zone_id: string;
  table_number: string;
  display_name: string;
  capacity: number;
  is_active: boolean;
}
