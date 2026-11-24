const SHORT_HEX = /^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/;

/**
 * "#f80" -> "#FF8800". Toute autre valeur est rendue telle quelle (sans espaces
 * autour), pour que le validateur qui suit la juge.
 *
 * Les reglages du restaurant acceptent une couleur au format court, mais la
 * vitrine et l'export du chevalet ne lisent que #RRGGBB (B27, B11).
 */
export function expandShortHex(value: string): string {
  const trimmed = value.trim();
  const m = SHORT_HEX.exec(trimmed);
  if (!m) return trimmed;
  return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toUpperCase();
}
