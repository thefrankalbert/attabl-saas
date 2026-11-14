/**
 * Valeur de l'en-tete Retry-After (secondes) tiree de l'horodatage de remise a
 * zero d'un limiteur (`reset`, en ms). `reset` vaut 0 quand il est inconnu: on
 * replie alors sur `fallbackSeconds`. Jamais inferieur a 1.
 */
export function retryAfterSeconds(reset: number, fallbackSeconds = 3600, now = Date.now()): string {
  if (!reset || reset <= now) return String(fallbackSeconds);
  return String(Math.max(1, Math.ceil((reset - now) / 1000)));
}
