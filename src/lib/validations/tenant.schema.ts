import { z } from 'zod';

/**
 * Zod schemas for tenant validation.
 * Used in tenant-settings server action.
 */

const hexColorRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export const updateTenantSettingsSchema = z.object({
  name: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(100, 'Le nom ne doit pas dépasser 100 caractères'),
  description: z.string().max(500, 'La description ne doit pas dépasser 500 caractères').optional(),
  primaryColor: z
    .string()
    .regex(hexColorRegex, 'Couleur primaire invalide (format: #RGB ou #RRGGBB)'),
  secondaryColor: z
    .string()
    .regex(hexColorRegex, 'Couleur secondaire invalide (format: #RGB ou #RRGGBB)'),
  address: z.string().max(200, "L'adresse ne doit pas dépasser 200 caractères").optional(),
  city: z.string().max(100, 'La ville ne doit pas dépasser 100 caractères').optional(),
  country: z.string().max(100, 'Le pays ne doit pas dépasser 100 caractères').optional(),
  phone: z.string().max(20, 'Le téléphone ne doit pas dépasser 20 caractères').optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  notificationSoundId: z.string().max(500).optional(),
  establishmentType: z.string().max(50).optional(),
  tableCount: z.number().int().min(0).max(500).optional(),
  // ─── Production upgrade: business config ─────────────────
  currency: z.enum(['XAF', 'EUR', 'USD']).optional(),
  supportedCurrencies: z
    .array(z.enum(['XAF', 'EUR', 'USD']))
    .min(1)
    .optional(),
  taxRate: z
    .number()
    .min(0, 'Le taux ne peut pas être négatif')
    .max(100, 'Le taux ne peut pas dépasser 100%')
    .optional(),
  serviceChargeRate: z
    .number()
    .min(0, 'Le taux ne peut pas être négatif')
    .max(100, 'Le taux ne peut pas dépasser 100%')
    .optional(),
  enableTax: z.boolean().optional(),
  enableServiceCharge: z.boolean().optional(),
  // ─── Idle timeout / screen lock ────────────────────────
  idleTimeoutMinutes: z
    .number()
    .int()
    .min(5, 'Minimum 5 minutes')
    .max(120, 'Maximum 120 minutes')
    .nullable()
    .optional(),
  screenLockMode: z.enum(['overlay', 'password']).optional(),
  // ─── Custom domain ───────────────────────────────────────
  customDomain: z
    .string()
    .max(255, 'Le domaine ne doit pas dépasser 255 caractères')
    .nullable()
    .optional(),
});

export type UpdateTenantSettingsInput = z.infer<typeof updateTenantSettingsSchema>;
