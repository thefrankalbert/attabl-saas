import { z } from 'zod';
import { renderableImageUrlSchema } from './image-url.schema';

/**
 * Nom d'une categorie, en francais et en anglais: 100 caracteres au plus, comme
 * le nom d'une carte (menu.schema.ts). La colonne `categories.name` est un
 * `text` sans borne: sans cette limite, un nom de 408 caracteres etait accepte
 * (audit de mise en production du 2026-11-23). Meme valeur en `maxLength` sur
 * les champs du formulaire.
 */
export const CATEGORY_NAME_MAX = 100;

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Le nom est obligatoire.')
  .max(CATEGORY_NAME_MAX, `Maximum ${CATEGORY_NAME_MAX} caractères`);

export const categoryNameEnSchema = z
  .string()
  .trim()
  .max(CATEGORY_NAME_MAX, `Maximum ${CATEGORY_NAME_MAX} caractères`)
  .nullish();

/**
 * Validation des ecritures de rubriques (categories), audit B41.
 *
 * Avant, `actionCreateCategory` / `actionUpdateCategory` ne validaient que
 * l'image: un nom fait d'espaces, un `display_order` decimal ou negatif, une
 * `preparation_zone` inconnue arrivaient jusqu'a la base. Les cles suivent
 * ALLOWED_CATEGORY_COLUMNS (category.service.ts). `tenant_id` n'en fait pas
 * partie: l'action le derive de la session.
 *
 * Bornes genereuses (le plus long nom en production fait 26 caracteres, le
 * plus grand rang 104, lecture du 2026-11-24) pour ne jamais bloquer
 * l'edition d'une ligne existante.
 */
const categoryWriteSchema = z.object({
  name: categoryNameSchema,
  name_en: categoryNameEnSchema,
  icon: z.string().max(100).nullish(),
  // Rendue par next/image sur la carte client: un hote etranger ferait tomber
  // la vitrine (image-url.schema.ts).
  image_url: renderableImageUrlSchema.nullish().or(z.literal('')),
  display_order: z.number().int().min(0).max(100_000).optional(),
  preparation_zone: z.enum(['kitchen', 'bar', 'both']).optional(),
  is_featured_on_home: z.boolean().optional(),
  is_active: z.boolean().optional(),
  menu_id: z.string().uuid().nullish(),
});

export const categoryCreateSchema = categoryWriteSchema;

/**
 * La carte est requise (null = rubrique hors carte): le controle de doublon au
 * renommage compare dans cette carte (audit B33).
 */
export const categoryUpdateSchema = categoryWriteSchema.extend({
  menu_id: z.string().uuid().nullable(),
});

/** Reordonnancement: tableau borne, identifiants uniques (audit B41). */
export const categoryReorderSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      display_order: z.number().int().min(0).max(100_000),
    }),
  )
  .max(500)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: 'Identifiant en double',
  });
