import { z } from 'zod';
import { expandShortHex } from '@/lib/utils/hex-color';

// B11: les reglages du restaurant acceptent #RGB; l'export le convertit en
// #RRGGBB (format du PDF) au lieu de le refuser.
const hexColorSchema = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Couleur hex invalide (#RGB ou #RRGGBB)')
  .transform(expandShortHex);

const logoConfigSchema = z.object({
  visible: z.boolean(),
  x: z.number().min(0).max(21.7),
  y: z.number().min(0).max(11),
  width: z.number().min(0.5).max(21.7),
});

const textConfigSchema = z.object({
  visible: z.boolean(),
  x: z.number().min(0).max(21.7),
  y: z.number().min(0).max(11),
  fontSize: z.number().min(6).max(72),
  text: z.string().max(200),
});

const nameConfigSchema = textConfigSchema.extend({
  text: z.string().max(100),
});

const qrConfigSchema = z.object({
  x: z.number().min(0).max(21.7),
  y: z.number().min(0).max(11),
  width: z.number().min(2).max(10),
  // Light-on-dark QR styles were removed on 2026-11-23 (many phone cameras
  // cannot read them); a saved config that still holds one prints "classic".
  style: z.preprocess(
    (v) => (v === 'inverted' || v === 'dark' ? 'classic' : v),
    z.enum(['classic', 'branded']),
  ),
  menuUrl: z.string().url(),
});

export const chevaletConfigSchema = z.object({
  unit: z.enum(['cm', 'mm', 'px']),
  background: hexColorSchema,
  accentColor: hexColorSchema,
  logo: logoConfigSchema,
  name: nameConfigSchema,
  tagline: textConfigSchema,
  qrCode: qrConfigSchema,
  verso: z.enum(['none', 'logo', 'mirror']),
});

// B29: la route ne produit qu'un PDF et lit le restaurant de la session. Les
// anciens champs `format`, `menuUrl` et `tenantSlug` etaient exiges puis
// ignores (`format: 'png'` rendait un PDF): retires.
export const exportRequestSchema = z.object({
  config: chevaletConfigSchema,
});
