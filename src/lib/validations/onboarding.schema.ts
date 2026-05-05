import { z } from 'zod';

// Shared sub-schemas
const menuItemSchema = z.object({
  name: z.string().max(200),
  price: z.number().min(0).optional().default(0),
  category: z.string().max(100).optional(),
  imageUrl: z.string().max(500).optional(),
});

const tableZoneSchema = z.object({
  name: z.string().max(100),
  prefix: z.string().max(10),
  tableCount: z.number().int().min(1).max(200),
  defaultCapacity: z.number().int().min(1).max(50).optional(),
});

/**
 * Draft data schema for /api/onboarding/save.
 * Zod strips unknown keys by default — prevents unbounded JSONB storage abuse.
 * All known fields are bounded. Colors use max-only (no regex) because the
 * user may be mid-typing a partial hex value during auto-save.
 * Navigation metadata (_phase/_subScreen) is stored alongside data and
 * filtered at restore time.
 */
const onboardingDraftDataSchema = z.object({
  // Tenant identity
  tenantId: z.string().uuid().optional(),
  tenantName: z.string().max(200).optional(),
  tenantNickname: z.string().max(50).optional(),
  tenantSlug: z.string().max(100).optional(),
  // Establishment
  establishmentType: z.string().max(50).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  language: z.string().max(10).optional(),
  currency: z.string().max(10).optional(),
  // Type-specific optional fields
  starRating: z.number().int().min(1).max(5).optional(),
  hasRestaurant: z.boolean().optional(),
  hasTerrace: z.boolean().optional(),
  hasWifi: z.boolean().optional(),
  registerCount: z.number().int().min(0).max(100).optional(),
  hasDelivery: z.boolean().optional(),
  totalCapacity: z.number().int().min(0).max(10000).optional(),
  // Tables
  tableCount: z.number().int().min(0).max(500).optional(),
  tableConfigMode: z.enum(['complete', 'minimum', 'skip']).optional(),
  tableZones: z.array(tableZoneSchema).max(20).optional(),
  // Branding
  logoUrl: z.string().max(500).optional(),
  primaryColor: z.string().max(7).optional(),
  secondaryColor: z.string().max(7).optional(),
  description: z.string().max(500).optional(),
  // Menu
  menuOption: z.enum(['manual', 'import', 'template', 'skip']).optional(),
  menuItems: z.array(menuItemSchema).max(50).optional(),
  // QR customization
  qrTemplate: z.string().max(50).optional(),
  qrStyle: z.string().max(50).optional(),
  qrCta: z.string().max(200).optional(),
  qrDescription: z.string().max(500).optional(),
  // Navigation metadata (stored with data, filtered at restore)
  _phase: z.number().int().min(0).max(10).optional(),
  _subScreen: z.number().int().min(0).max(10).optional(),
});

export const onboardingSaveSchema = z.object({
  step: z
    .number()
    .int('Le step doit etre un entier')
    .min(1, 'Step minimum: 1')
    .max(6, 'Step maximum: 6'),
  data: onboardingDraftDataSchema,
});

export type OnboardingSaveInput = z.infer<typeof onboardingSaveSchema>;

/**
 * Schema for onboarding completion (/api/onboarding/complete).
 * Validates all fields that get written to the tenants table.
 * Applies strict format checks (hex color regex) that are too strict for mid-typing saves.
 */
export const onboardingCompleteSchema = z.object({
  data: z.object({
    tenantName: z.string().max(200).optional(),
    establishmentType: z.enum(['restaurant', 'hotel', 'bar', 'cafe', 'fastfood']).optional(),
    address: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    phone: z.string().max(20).optional(),
    tableCount: z.number().int().min(0).max(500).optional(),
    tableConfigMode: z.enum(['complete', 'minimum', 'skip']).optional(),
    tableZones: z.array(tableZoneSchema).max(20).optional(),
    logoUrl: z.string().optional(),
    primaryColor: z
      .string()
      .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
      .optional(),
    secondaryColor: z
      .string()
      .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
      .optional(),
    description: z.string().max(500).optional(),
    currency: z.string().max(10).optional(),
    language: z.string().max(10).optional(),
    tenantSlug: z.string().max(100).optional(),
    tenantNickname: z.string().max(50).optional(),
    menuItems: z.array(menuItemSchema).max(50).optional(),
  }),
});

export type OnboardingCompleteInput = z.infer<typeof onboardingCompleteSchema>;
