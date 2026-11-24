export interface ZoneData {
  name: string;
  prefix: string;
  tableCount: number;
  defaultCapacity?: number;
}

export type ConfigMode = 'complete' | 'minimum' | 'skip';

/** Limite du serveur par zone (onboarding.schema.ts, tableZoneSchema). */
export const MAX_TABLES_PER_ZONE = 200;

export const capacityOptions = [2, 4, 6, 8, 10, 12];

/** Derive a prefix from a zone name: first 3 uppercase letters. */
export function derivePrefix(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase();
}
