import { z } from 'zod';

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

export const tableConfigSchema = z.object({
  zones: z.array(zoneSchema).min(1, 'Au moins une zone est requise').max(20, 'Maximum 20 zones'),
});

export const addTablesSchema = z.object({
  zone_id: z.string().uuid('ID de zone invalide'),
  count: z.number().int().min(1, 'Minimum 1 table').max(50, 'Maximum 50 tables a la fois'),
  capacity: z
    .number()
    .int()
    .min(1, 'Minimum 1 place')
    .max(20, 'Maximum 20 places')
    .optional()
    .default(2),
});

export type ZoneInput = z.infer<typeof zoneSchema>;
