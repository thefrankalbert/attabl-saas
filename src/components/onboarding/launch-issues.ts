import type { ZoneIssueCode } from '@/lib/validations/onboarding.schema';

/** Refus du lancement tel que la route le renvoie (chemin et message separes). */
export interface LaunchIssue {
  path: string[];
  message: string;
}

const ZONE_CODES: readonly ZoneIssueCode[] = [
  'ZONE_PREFIX_INVALID',
  'ZONE_PREFIX_DUPLICATE',
  'ZONE_NAME_DUPLICATE',
];

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Libelle d'une zone pour le restaurateur: son numero AFFICHE (indice + 1) et
 * son nom quand elle en a un. Jamais l'indice informatique.
 */
export function zoneLabel(index: number, name: string | undefined, t: Translate): string {
  const trimmed = name?.trim();
  return trimmed
    ? t('zoneLabelNamed', { number: index + 1, name: trimmed })
    : t('zoneLabel', { number: index + 1 });
}

/** Phrases lisibles pour les refus du lancement (contre-audit 3). */
export function describeLaunchIssues(
  issues: LaunchIssue[],
  zones: { name: string; prefix: string }[],
  t: Translate,
): string[] {
  return issues.map((issue) => {
    const [root, list, rawIndex] = issue.path;
    const index = Number(rawIndex);
    if (
      root === 'data' &&
      list === 'tableZones' &&
      Number.isInteger(index) &&
      (ZONE_CODES as readonly string[]).includes(issue.message)
    ) {
      const zone = zones[index];
      return t(`zoneIssue.${issue.message}`, {
        zone: zoneLabel(index, zone?.name, t),
        prefix: zone?.prefix ?? '',
        name: zone?.name?.trim() ?? '',
      });
    }
    return issue.message;
  });
}
