/**
 * Validation schema for tenant brand customization.
 *
 * Enforces WCAG AA contrast compliance on the primary brand color and
 * restricts font choices to the curated font list.
 */

import { z } from 'zod';
import { validateBrandPrimary } from '@/lib/utils/wcag';
import { isValidFont } from '@/lib/validations/font';

export const tenantBrandUpdateSchema = z.object({
  primary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (#RRGGBB)')
    .refine((hex) => validateBrandPrimary(hex).valid, {
      message:
        'Color does not meet WCAG AA contrast requirements (4.5:1 against white). Please choose a darker shade. See the Brand Guide for recommended colors.',
    })
    .optional(),
  font_family: z
    .string()
    .refine((font) => isValidFont(font), {
      message: 'Font must be from the curated list. See /lib/config/fonts.ts',
    })
    .optional(),
});

export type TenantBrandUpdateInput = z.infer<typeof tenantBrandUpdateSchema>;
