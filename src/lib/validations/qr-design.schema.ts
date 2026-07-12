import { z } from 'zod';
import { QR_MESSAGE_MAX_LENGTH } from '@/types/qr-design.types';

/**
 * Validation schemas for QR design persistence.
 *
 * The full design config is stored as jsonb in `qr_designs.config`, so it MUST
 * be validated on every write (server action + service) to keep the column
 * trustworthy. Shapes mirror QRDesignConfig in src/types/qr-design.types.ts.
 */

const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Couleur hex invalide');

const templateId = z.enum(['minimal', 'carte', 'chevalet']);
const errorCorrection = z.enum(['L', 'M', 'Q', 'H']);
const dotStyle = z.enum(['square', 'rounded', 'dots', 'classy', 'extra-rounded']);
const cornerStyle = z.enum(['square', 'rounded', 'dot']);
const exportFormat = z.enum(['pdf', 'png', 'svg']);
const ctaPreset = z.enum([
  'scannez-commander',
  'scannez-menu',
  'scannez-decouvrir',
  'scannez-carte',
  'custom',
]);
const cardFormat = z.enum([
  'standard-25x13',
  'square-10',
  'a6-chevalet',
  'business-card',
  'bare',
  'custom',
]);
const perPage = z.union([z.literal(1), z.literal(2), z.literal(4), z.literal('auto')]);

const logoSchema = z.object({
  enabled: z.boolean(),
  // A downscaled 256px PNG logo (see lib/qr/resize-image.ts) is well under this;
  // 200 KB bounds abuse. A raw upload data URL used to blow past the old 2048 cap
  // and made every save with a logo fail.
  src: z.string().max(200_000),
  width: z.number().min(0).max(400),
  height: z.number().min(0).max(400),
  excavate: z.boolean(),
  opacity: z.number().min(0).max(1),
});

const printLayoutSchema = z.object({
  cardFormat,
  perPage,
  bareQr: z.boolean(),
  message: z.object({
    enabled: z.boolean(),
    text: z.string().max(QR_MESSAGE_MAX_LENGTH),
  }),
});

export const qrDesignConfigSchema = z.object({
  templateId,
  qrFgColor: hexColor,
  qrBgColor: hexColor,
  errorCorrection,
  qrSize: z.number().min(50).max(1000),
  marginSize: z.number().min(0).max(32),
  logo: logoSchema,
  templateWidth: z.number().min(20).max(400),
  templateHeight: z.number().min(20).max(400),
  cornerRadius: z.number().min(0).max(64),
  padding: z.number().min(0).max(128),
  templateBgColor: hexColor,
  templateAccentColor: hexColor,
  templateTextColor: hexColor,
  ctaPreset,
  ctaText: z.string().max(120),
  showPoweredBy: z.boolean(),
  fontFamily: z.string().max(60),
  exportFormat,
  printLayout: printLayoutSchema,
  qrDotStyle: dotStyle,
  qrCornerStyle: cornerStyle,
});

export const saveQrDesignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Nom requis').max(80),
  config: qrDesignConfigSchema,
  isDefault: z.boolean(),
});

export const assignQrDesignSchema = z.object({
  target: z.enum(['table', 'zone']),
  targetId: z.string().uuid(),
  // null = unassign (fall back to inherited/default resolution).
  designId: z.string().uuid().nullable(),
});

export type SaveQrDesignInput = z.infer<typeof saveQrDesignSchema>;
export type AssignQrDesignInput = z.infer<typeof assignQrDesignSchema>;
