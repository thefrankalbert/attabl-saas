import { cspReportUriSchema, reportingApiSchema } from '@/lib/validations/csp-report.schema';

/**
 * Resume d'un rapport de violation CSP, pret pour les journaux: aucun parametre
 * de requete (un lien de reinitialisation ou un jeton peut y figurer), adresses
 * tronquees.
 */
export interface ResumeViolationCsp {
  directive: string;
  bloque: string;
  page: string;
}

const LONGUEUR_MAX = 200;

/** Origine + chemin, sans requete ni fragment; mots-cles (`inline`, `eval`) gardes. */
function sansRequete(valeur: string | undefined): string {
  if (!valeur) return '';
  try {
    const url = new URL(valeur);
    return `${url.origin}${url.pathname}`.slice(0, LONGUEUR_MAX);
  } catch {
    return valeur.split(/[?#]/)[0].slice(0, LONGUEUR_MAX);
  }
}

/**
 * Lit un corps deja analyse selon son type. Rend la liste des violations
 * resumees, ou null si le corps n'est pas un rapport CSP reconnu.
 */
export function resumerRapportsCsp(
  typeContenu: 'csp-report' | 'reports+json',
  corps: unknown,
): ResumeViolationCsp[] | null {
  if (typeContenu === 'csp-report') {
    const parsed = cspReportUriSchema.safeParse(corps);
    if (!parsed.success) return null;
    const r = parsed.data['csp-report'];
    return [
      {
        directive: (r['effective-directive'] ?? r['violated-directive'] ?? '').slice(0, 100),
        bloque: sansRequete(r['blocked-uri']),
        page: sansRequete(r['document-uri']),
      },
    ];
  }

  const parsed = reportingApiSchema.safeParse(corps);
  if (!parsed.success) return null;
  return parsed.data
    .filter((r) => r.type === 'csp-violation')
    .map((r) => ({
      directive: (r.body?.effectiveDirective ?? '').slice(0, 100),
      bloque: sansRequete(r.body?.blockedURL),
      page: sansRequete(r.body?.documentURL ?? r.url),
    }));
}
