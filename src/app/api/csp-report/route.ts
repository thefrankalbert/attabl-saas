import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { kitchenItemLimiter, getClientIp } from '@/lib/rate-limit';
import { resumerRapportsCsp } from '@/lib/csp-report';

/**
 * Rapports de violation CSP (audit K3.16), declares par `report-uri` dans
 * src/lib/csp.ts. Route publique: les navigateurs l'appellent sans session.
 *
 * Limiteur: compartiment large et fail-OPEN (240 par minute) avec une cle
 * propre a cette route; un rapport n'a aucun effet de bord, il ne doit jamais
 * gener la navigation, mais une inondation ne doit pas remplir les journaux.
 * Corps borne a 10 ko. Reponse 204 sans contenu, comme l'attendent les
 * navigateurs.
 */

const TAILLE_MAX_CORPS = 10 * 1024;
const VIOLATIONS_MAX_PAR_RAPPORT = 5;

function typeDeContenu(entete: string | null): 'csp-report' | 'reports+json' | null {
  const type = (entete ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'application/csp-report') return 'csp-report';
  if (type === 'application/reports+json') return 'reports+json';
  return null;
}

export async function POST(request: Request) {
  const limite = await kitchenItemLimiter.check(`csp-report:${getClientIp(request)}`);
  if (!limite.success) return new NextResponse(null, { status: 429 });

  const type = typeDeContenu(request.headers.get('content-type'));
  if (!type) return new NextResponse(null, { status: 415 });

  const annonce = Number(request.headers.get('content-length') ?? '0');
  if (annonce > TAILLE_MAX_CORPS) return new NextResponse(null, { status: 413 });
  const corps = await request.text();
  if (corps.length > TAILLE_MAX_CORPS) return new NextResponse(null, { status: 413 });

  let brut: unknown;
  try {
    brut = JSON.parse(corps);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const violations = resumerRapportsCsp(type, brut);
  if (!violations) return new NextResponse(null, { status: 400 });

  for (const violation of violations.slice(0, VIOLATIONS_MAX_PAR_RAPPORT)) {
    logger.warn('CSP violation', { ...violation });
  }
  return new NextResponse(null, { status: 204 });
}
