import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const DELAI_BASE_MS = 3000;
const DELAI_REDIS_MS = 2000;

/**
 * Sonde Redis (Upstash). Les limiteurs de connexion, d'inscription et de
 * commande refusent tout quand Redis est en panne: un point de sante qui ne
 * le regarde pas repond "ok" pendant que personne ne peut se connecter.
 * Sans Redis configure (poste local), il n'y a rien a sonder.
 */
// Le point de sante est public et sans limiteur. Chaque sonde Redis est une
// commande facturee: son resultat est garde 30 s par instance, pour qu'une
// boucle anonyme ne puisse pas epuiser le quota dont dependent les limiteurs.
const DUREE_CACHE_REDIS_MS = 30_000;
let dernierRedis: { ok: boolean; a: number } | null = null;

async function redisRepond(): Promise<boolean> {
  if (dernierRedis && Date.now() - dernierRedis.a < DUREE_CACHE_REDIS_MS) return dernierRedis.ok;
  const ok = await sonderRedis();
  dernierRedis = { ok, a: Date.now() };
  return ok;
}

async function sonderRedis(): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return true;
  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(DELAI_REDIS_MS),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function baseRepond(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('tenants')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(DELAI_BASE_MS));
    if (error) {
      logger.error('Health check: database query failed', error);
      return false;
    }
    return true;
  } catch (err) {
    logger.error('Health check: database unreachable', err);
    return false;
  }
}

export async function GET() {
  const [base, redis] = await Promise.all([baseRepond(), redisRepond()]);
  if (!redis) logger.error('Health check: Redis unreachable');

  if (base && redis) return NextResponse.json({ status: 'ok' });
  // Le detail (quelle dependance) reste dans les journaux, pas dans la reponse.
  return NextResponse.json({ status: 'degraded' }, { status: 503 });
}
