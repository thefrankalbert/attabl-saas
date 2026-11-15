import { z } from 'zod';

/**
 * Validation for super-admin (god-mode) Command Center actions.
 * Reasons are bounded so audit-trail rows stay sane; ids must be UUIDs.
 */

const reason = z.string().trim().max(500).optional();

export const tenantActionSchema = z.object({
  tenantId: z.string().uuid(),
  reason,
});

export const adminUserActionSchema = z.object({
  adminUserId: z.string().uuid(),
  reason,
});

/**
 * Numero du support (WhatsApp et appel), saisi dans la console: "+" et
 * l'indicatif obligatoires, chiffres et espaces, de 8 a 15 chiffres (norme E.164).
 */
export const supportContactSchema = z.object({
  phone: z
    .string()
    .trim()
    // "+" puis l'indicatif: un numero local (70 12 34 56) ou en 00226 donnerait un
    // lien wa.me/tel: vers un autre pays ou casse.
    .regex(
      /^\+[1-9][\d ]*$/,
      'Commencez par + et l indicatif, chiffres et espaces seulement (ex: +226 55 21 22 93)',
    )
    .refine((v) => {
      const n = v.replace(/\D/g, '').length;
      return n >= 8 && n <= 15;
    }, 'Le numero doit compter de 8 a 15 chiffres, indicatif compris'),
});
