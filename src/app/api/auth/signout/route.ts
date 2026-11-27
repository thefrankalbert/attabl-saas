import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { signoutLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';

/**
 * Portee de la deconnexion. Par defaut "local": seul l'appareil utilise est
 * deconnecte (decision du proprietaire du 2026-11-27, une tablette de caisse et
 * un telephone partagent souvent le meme compte). "global" ferme toutes les
 * sessions du compte: reserve au bouton "Se deconnecter partout" de la page
 * Securite, qui le demande explicitement par ?scope=global.
 */
const scopeSchema = z.enum(['local', 'global']).catch('local');

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await signoutLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const supabase = await createClient();
    // signOut() ne leve pas: il renvoie { error }. Sans ce controle, un echec de
    // revocation repondait comme un succes, et "Se deconnecter partout" laissait
    // croire que les autres appareils etaient fermes alors qu'ils ne l'etaient pas.
    const scope = scopeSchema.parse(new URL(request.url).searchParams.get('scope') ?? 'local');
    const { error } = await supabase.auth.signOut({ scope });
    if (error) {
      logger.error('Signout revocation failed', error);
      return NextResponse.json({ error: 'Signout failed' }, { status: 502 });
    }

    const origin = new URL(request.url).origin;
    return NextResponse.redirect(`${origin}/login`, { status: 302 });
  } catch (error) {
    // Une exception n'est pas une deconnexion reussie: on ne redirige pas comme
    // si elle l'etait (le menu du compte navigue vers /login de lui-meme).
    logger.error('Signout error', error);
    return NextResponse.json({ error: 'Signout failed' }, { status: 500 });
  }
}
