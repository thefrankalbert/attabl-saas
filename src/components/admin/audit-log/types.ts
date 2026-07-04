export interface AuditLogEntry {
  id: string;
  created_at: string;
  user_email: string | null;
  user_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export const PAGE_SIZE = 25;

export const ENTITY_TYPES = [
  'order',
  'menu',
  'item',
  'category',
  'user',
  'permission',
  'setting',
  'ingredient',
  'coupon',
  'supplier',
] as const;

export const ACTIONS = ['create', 'update', 'delete'] as const;
