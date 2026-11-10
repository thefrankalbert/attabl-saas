import { z } from 'zod';

// --- Row Validation Schema ------------------------------------

export const excelRowSchema = z.object({
  category: z
    .string({ error: 'Categorie obligatoire' })
    .min(1, 'Categorie obligatoire')
    .max(100, 'Categorie trop longue (100 caracteres maximum)'),
  categoryEn: z
    .string()
    .max(100, 'Categorie EN trop longue (100 caracteres maximum)')
    .nullable()
    .optional(),
  name: z
    .string({ error: 'Nom du plat obligatoire' })
    .min(1, 'Nom du plat obligatoire')
    .max(200, 'Nom du plat trop long (200 caracteres maximum)'),
  nameEn: z
    .string()
    .max(200, 'Nom du plat EN trop long (200 caracteres maximum)')
    .nullable()
    .optional(),
  description: z
    .string()
    .max(1000, 'Description trop longue (1000 caracteres maximum)')
    .nullable()
    .optional(),
  descriptionEn: z
    .string()
    .max(1000, 'Description EN trop longue (1000 caracteres maximum)')
    .nullable()
    .optional(),
  price: z
    .number({ error: 'Prix manquant ou illisible' })
    .positive('Le prix doit etre superieur a zero'),
  // null = case laissee vide (voir le parser).
  isAvailable: z.boolean().nullable(),
  isFeatured: z.boolean().nullable(),
});
