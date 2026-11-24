import { z } from 'zod';

/** Longueur minimale d'un terme: une lettre seule ne part pas au serveur. */
export const MENU_SEARCH_MIN_LENGTH = 2;

/** Terme de la recherche convive (`GET /api/menu-search?q=`). */
export const menuSearchQuerySchema = z.object({
  q: z.string().trim().min(MENU_SEARCH_MIN_LENGTH).max(80),
});
