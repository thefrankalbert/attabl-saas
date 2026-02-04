import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const hostname = request.headers.get('host') || '';

  // Extraire le sous-domaine
  const subdomain = extractSubdomain(hostname);

  // Si on est sur le domaine principal (attabl.com)
  if (!subdomain || subdomain === 'www') {
    // Landing page, pas de tenant
    return response;
  }

  // Si on est sur un sous-domaine (radisson.attabl.com)
  // Injecter le slug du tenant dans les headers
  response.headers.set('x-tenant-slug', subdomain);

  // TODO: Vérifier que le tenant existe en DB (plus tard)

  return response;
}

function extractSubdomain(hostname: string): string | null {
  // Supporte :
  // - radisson.attabl.com → "radisson"
  // - localhost:3000 → null (dev local)
  // - attabl.com → null (domaine principal)

  // En dev local
  if (hostname.includes('localhost')) {
    return null;
  }

  // Extraire sous-domaine
  const parts = hostname.split('.');

  // Si attabl.com (2 parties) → pas de sous-domaine
  if (parts.length === 2) {
    return null;
  }

  // Si radisson.attabl.com (3 parties) → "radisson"
  if (parts.length >= 3) {
    return parts[0];
  }

  return null;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
