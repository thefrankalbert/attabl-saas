import { z } from 'zod';

/** Fenetre la plus ancienne lisible: le graphique "mois" remonte au 1er (31 j). */
const MAX_WINDOW_MS = 40 * 24 * 60 * 60 * 1000;

const windowStart = z.iso
  .datetime({ offset: true })
  .refine((v) => Date.now() - Date.parse(v) <= MAX_WINDOW_MS, 'Fenetre trop ancienne');

/** Restaurants charges par la console (la page en charge 50 au plus). */
const tenantIds = z.array(z.string().uuid()).max(200);

/**
 * Corps de POST /api/admin/command-center. Les bornes de jour viennent du
 * navigateur: les jours et les heures sont ceux du fuseau de l'operateur.
 */
export const commandCenterQuerySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('overview'),
    tenantIds,
    todayStart: windowStart,
    yesterdayStart: windowStart,
  }),
  z.object({ kind: z.literal('chart'), tenantIds, start: windowStart }),
]);
