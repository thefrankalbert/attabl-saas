import { z } from 'zod';
import { expandShortHex } from '@/lib/utils/hex-color';
import { isRenderableImageUrl, renderableImageUrlSchema } from './image-url.schema';
import { zoneSchema } from './table-config.schema';
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

/**
 * B59: plafond du brouillon enregistre tel quel dans
 * `onboarding_progress.draft`. Une carte de 50 plats et 20 zones tient en
 * quelques dizaines de Ko; sans plafond, n'importe quelle taille etait gardee.
 */
export const ONBOARDING_DRAFT_MAX_CHARS = 100_000;

export const onboardingSaveSchema = z.object({
  step: z
    .number()
    .int('Le step doit être un entier')
    .min(1, 'Step minimum: 1')
    .max(6, 'Step maximum: 6'),
  data: z
    .record(z.string(), z.unknown())
    .refine((d) => JSON.stringify(d).length <= ONBOARDING_DRAFT_MAX_CHARS, {
      message: 'Brouillon trop volumineux',
    }),
});

const establishmentTypeSchema = z.enum(['restaurant', 'hotel', 'bar', 'cafe', 'fastfood', 'other']);

/** B27: enregistree en #RRGGBB, seul format que lit la vitrine. */
const hexColorSchema = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
  .transform(expandShortHex);

/**
 * B26: un logo s'affiche dans la vitrine et dans les e-mails d'invitation.
 * Seule une image envoyee depuis l'application (stockage Supabase) est
 * acceptee; la chaine vide veut dire "pas de logo".
 */
const logoUrlSchema = z.union([z.literal(''), renderableImageUrlSchema]);

/**
 * B10/B59: champs qu'une etape de la sauvegarde ecrit dans `tenants`. Les
 * etapes absentes (2, 4, 5) n'ecrivent que le brouillon. Memes bornes que le
 * lancement (onboardingCompleteSchema), qui reecrit ces colonnes.
 */
export const onboardingStep1Schema = z.object({
  tenantName: z.string().max(200).optional(),
  establishmentType: establishmentTypeSchema.optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  tableCount: z.number().int().min(0).max(500).optional(),
});

export const onboardingStep3Schema = z.object({
  logoUrl: logoUrlSchema.optional(),
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
  description: z.string().max(500).optional(),
});

export type ZoneIssueCode = 'ZONE_PREFIX_INVALID' | 'ZONE_PREFIX_DUPLICATE' | 'ZONE_NAME_DUPLICATE';

export interface ZoneIssue {
  /** Indice de la zone (la zone affichee "4" a l'indice 3). */
  index: number;
  field: 'prefix' | 'name';
  code: ZoneIssueCode;
}

/**
 * Problemes des zones qui seront creees: prefixe hors regle (celle de
 * Reglages > Tables), prefixe ou nom deja porte par une zone precedente
 * (insensible a la casse). Partage par le schema de lancement et l'etape des
 * tables, pour que l'erreur se voie la ou elle se corrige.
 */
export function findZoneIssues(zones: { name: string; prefix: string }[]): ZoneIssue[] {
  const issues: ZoneIssue[] = [];
  const prefixes = new Set<string>();
  const names = new Set<string>();
  zones.forEach((zone, index) => {
    if (!zoneSchema.shape.prefix.safeParse(zone.prefix).success) {
      issues.push({ index, field: 'prefix', code: 'ZONE_PREFIX_INVALID' });
    } else {
      const key = zone.prefix.toUpperCase();
      if (prefixes.has(key)) issues.push({ index, field: 'prefix', code: 'ZONE_PREFIX_DUPLICATE' });
      prefixes.add(key);
    }
    const name = zone.name.trim().toLowerCase();
    if (name) {
      if (names.has(name)) issues.push({ index, field: 'name', code: 'ZONE_NAME_DUPLICATE' });
      names.add(name);
    }
  });
  return issues;
}

/**
 * Schema for onboarding completion (/api/onboarding/complete).
 * Validates all fields that get written to the tenants table.
 */
const menuItemSchema = z.object({
  name: z.string().max(200),
  // B61: borne de la colonne `menu_items.price` (numeric(10,2)). Au-dela, toute
  // la carte etait annulee au lancement sans dire quel plat.
  price: z.number().min(0).max(99_999_999).optional().default(0),
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
  // B28: la regle du prefixe n'est appliquee qu'aux zones que le serveur
  // utilise (voir le superRefine de onboardingCompleteSchema).
  prefix: z.string().max(10),
  tableCount: z.number().int().min(1).max(200),
  defaultCapacity: z.number().int().min(1).max(50).optional(),
});

export const onboardingCompleteSchema = z.object({
  data: z
    .object({
      tenantName: z.string().max(200).optional(),
      // 'other' est propose par l'ecran de choix du type (IdentitySection). Il
      // manquait ici: choisir "Autre" faisait echouer le lancement en
      // "Validation failed", au tout dernier bouton du parcours.
      establishmentType: establishmentTypeSchema.optional(),
      address: z.string().max(200).optional(),
      city: z.string().max(100).optional(),
      country: z.string().max(100).optional(),
      phone: z.string().max(20).optional(),
      tableCount: z.number().int().min(0).max(500).optional(),
      tableConfigMode: z.enum(['complete', 'minimum', 'skip']).optional(),
      tableZones: z.array(tableZoneSchema).max(20).optional(),
      logoUrl: logoUrlSchema.optional(),
      primaryColor: hexColorSchema.optional(),
      secondaryColor: hexColorSchema.optional(),
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
      // "inverted" and "dark" (light dots on a dark background) were removed on
      // 2026-11-23 because many phone cameras cannot read them: an old draft that
      // still holds one is printed dark-on-light ("classic").
      qrStyle: z
        .preprocess(
          (v) => {
            if (v === 'inverted' || v === 'dark') return 'classic';
            return typeof v === 'string' && !['classic', 'branded'].includes(v) ? 'branded' : v;
          },
          z.enum(['classic', 'branded']),
        )
        .optional(),
      qrCta: z.string().max(120).optional(),
      qrDescription: z.string().max(QR_MESSAGE_MAX_LENGTH).optional(),
    })
    // B28: le prefixe forme le numero de table (`PREFIXE-n`) lu par le QR, et
    // deux zones ne partagent ni prefixe ni nom (index uniques
    // `zones_tenant_upper_prefix_key` et `zones_venue_lower_name_key`: sinon
    // 409 au dernier bouton). Seulement pour les zones que le serveur cree: en
    // mode `skip`, onboarding.complete.ts les ignore. Meme regle que l'etape des
    // tables (findZoneIssues). Les messages sont des codes traduits par l'interface.
    .superRefine((data, ctx) => {
      if (data.tableConfigMode === 'skip' || !data.tableZones) return;
      for (const issue of findZoneIssues(data.tableZones)) {
        ctx.addIssue({
          code: 'custom',
          path: ['tableZones', issue.index, issue.field],
          message: issue.code,
        });
      }
    }),
});
