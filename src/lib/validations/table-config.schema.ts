import { z } from 'zod';

/** Plafond de places par table, le meme partout (formulaire et actions serveur). */
const MAX_TABLE_CAPACITY = 20;
/** Plafond de tables ajoutees en une fois, le meme partout. */
export const MAX_TABLES_PER_BATCH = 50;

/** Capacite d'une table: partagee par le formulaire et les actions serveur. */
export const tableCapacitySchema = z
  .number()
  .int()
  .min(1, 'Minimum 1 place')
  .max(MAX_TABLE_CAPACITY, 'Maximum 20 places');

/**
 * Numero de table tel que l'interface le fabrique (`PREFIXE-n`). Le numero part
 * dans l'URL du QR: `#`, `&`, `?`, `/` ou une espace la cassaient (revue L015,
 * A16). Lettres, chiffres et traits d'union seulement, pour accepter aussi les
 * prefixes de zones anterieurs a C-074.
 */
export const tableNumberSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/, 'Numero de table invalide');

export const zoneSchema = z.object({
  name: z.string().min(1, 'Le nom de la zone est requis').max(50, 'Maximum 50 caracteres'),
  prefix: z
    .string()
    .min(1, 'Le prefixe est requis')
    .max(5, 'Maximum 5 caracteres')
    .regex(/^[A-Z0-9]+$/, 'Le prefixe doit etre en majuscules (lettres et chiffres)'),
  tableCount: z.number().int().min(1, 'Minimum 1 table').max(100, 'Maximum 100 tables par zone'),
  defaultCapacity: z
    .number()
    .int()
    .min(1, 'Minimum 1 place')
    .max(20, 'Maximum 20 places')
    .optional()
    .default(2),
});

export const addTablesSchema = z.object({
  zone_id: z.string().uuid('ID de zone invalide'),
  count: z
    .number()
    .int()
    .min(1, 'Minimum 1 table')
    .max(MAX_TABLES_PER_BATCH, 'Maximum 50 tables a la fois'),
  capacity: tableCapacitySchema.optional().default(2),
});

export type ZoneInput = z.infer<typeof zoneSchema>;
