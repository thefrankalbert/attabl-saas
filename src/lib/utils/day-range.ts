/**
 * Bornes d'une plage de JOURS saisie dans deux champs date (`AAAA-MM-JJ`),
 * converties en instants ISO dans le fuseau du navigateur.
 *
 * Pourquoi: `2026-11-10` passe tel quel a une comparaison d'horodatage vaut
 * minuit. Un filtre "du 10 au 10" excluait donc toute la journee du 10: le
 * rapport des pertes affichait "Aucune perte" pour un jour qui en comptait
 * (audit 2026-11-10, C-047). Le jour de fin est INCLUS jusqu'a sa derniere
 * milliseconde.
 */
export function dayRangeToIso(
  startDay?: string,
  endDay?: string,
): { start?: string; end?: string } {
  const toIso = (day: string | undefined, time: string): string | undefined => {
    if (!day) return undefined;
    const instant = new Date(`${day}T${time}`);
    return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
  };
  return { start: toIso(startDay, '00:00:00.000'), end: toIso(endDay, '23:59:59.999') };
}
