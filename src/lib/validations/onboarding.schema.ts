import { z } from 'zod';
import { isRenderableImageUrl } from './image-url.schema';
import { QR_MESSAGE_MAX_LENGTH } from '@/types/qr-design.types';
import { coerceTemplateId } from '@/lib/qr/onboarding-qr-config';
import { establishmentDetailsSchema } from './establishment-details.schema';

/**
 * Zod schemas for onboarding validation.
 * Used in /api/onboarding/save and /api/onboarding/complete routes.
 */

/**
 * Optional `?site=<slug>` of the onboarding routes: which of the user's
 * establishments is being set up. Absent = the default pick (most recent
 * unfinished). It only selects among the user's own memberships (see
 * resolveSessionAdminUser), so a slug shape check is all it needs here.
 */
const onboardingSiteParamSchema = z
  .string()
  .max(100)
  .regex(/^[a-z0-9-]+$/)
  .nullable();

/** Reads and validates `?site=` from a request URL. `undefined` = invalid. */
export function readOnboardingSiteParam(requestUrl: string): string | null | undefined {
  const raw = new URL(requestUrl).searchParams.get('site');
  const parsed = onboardingSiteParamSchema.safeParse(raw === '' ? null : raw);
  return parsed.success ? parsed.data : undefined;
}

export const onboardingSaveSchema = z.object({
  step: z
    .number()
    .int('Le step doit être un entier')
    .min(1, 'Step minimum: 1')
    .max(6, 'Step maximum: 6'),
  data: z.record(z.string(), z.unknown()),
});

/**
 * Schema for onboarding completion (/api/onboarding/complete).
 * Validates all fields that get written to the tenants table.
 */
const menuItemSchema = z.object({
  name: z.string().max(200),
  price: z.number().min(0).optional().default(0),
  category: z.string().max(100).optional(),
  // A draft saved by an older version may hold a dead `blob:` URL: drop an
  // unrenderable address instead of failing the very last onboarding step.
  imageUrl: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v && isRenderableImageUrl(v) ? v : undefined)),
});

const tableZoneSchema = z.object({
  name: z.string().max(100),
  prefix: z.string().max(10),
  tableCount: z.number().int().min(1).max(200),
  defaultCapacity: z.number().int().min(1).max(50).optional(),
});

export const onboardingCompleteSchema = z.object({
  data: z.object({
    tenantName: z.string().max(200).optional(),
    // 'other' est propose par l'ecran de choix du type (IdentitySection). Il
    // manquait ici: choisir "Autre" faisait echouer le lancement en
    // "Validation failed", au tout dernier bouton du parcours.
    establishmentType: z
      .enum(['restaurant', 'hotel', 'bar', 'cafe', 'fastfood', 'other'])
      .optional(),
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
    // Seules les devises que la couche monetaire sait traiter (lib/constants
    // CURRENCIES + DINERO_CURRENCIES de money.ts). Accepter une autre chaine
    // n'echoue PAS a l'execution: money.ts retombe en silence sur la devise par
    // defaut, donc une devise a 2 decimales serait calculee comme une devise
    // sans decimale. Meme enum que tenant.schema.ts.
    currency: z.enum(['XAF', 'XOF', 'EUR', 'USD']).optional(),
    language: z.string().max(10).optional(),
    tenantSlug: z.string().max(100).optional(),
    menuItems: z.array(menuItemSchema).max(50).optional(),
    // Details propres au type (etoiles, terrasse, wifi...). Ils etaient retires
    // en silence par ce schema: memes bornes que la colonne qui les recoit.
    ...establishmentDetailsSchema.shape,
    // Choix du QR, enregistre comme design QR par defaut du restaurant.
    // A draft saved by an older version can hold a retired template id
    // ('elegant') or style: refusing it blocked the very last button. It is
    // mapped exactly like the preview maps it (coerceTemplateId), so what is
    // saved is what was shown.
    qrTemplate: z
      .preprocess(
        (v) => (typeof v === 'string' ? coerceTemplateId(v) : v),
        z.enum(['minimal', 'carte', 'chevalet']),
      )
      .optional(),
    qrStyle: z
      .preprocess(
        (v) =>
          typeof v === 'string' && !['classic', 'branded', 'inverted', 'dark'].includes(v)
            ? 'branded'
            : v,
        z.enum(['classic', 'branded', 'inverted', 'dark']),
      )
      .optional(),
    qrCta: z.string().max(120).optional(),
    qrDescription: z.string().max(QR_MESSAGE_MAX_LENGTH).optional(),
  }),
});
