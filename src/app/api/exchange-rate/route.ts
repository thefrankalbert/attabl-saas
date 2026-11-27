import { NextResponse } from 'next/server';
import { getUsdXafRate } from '@/lib/exchange-rate';
import { exchangeRateLimiter, getClientIp } from '@/lib/rate-limit';

// Le navigateur du visiteur n'appelle plus le service de taux de change: son adresse
// IP ne part donc plus chez un tiers. Le serveur interroge le service au plus une
// fois par jour et par instance (delai d'expiration 5 s, valeur de repli 605 dans
// getUsdXafRate), et le reseau de diffusion garde la reponse une heure.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { success } = await exchangeRateLimiter.check(getClientIp(request));
  if (!success) {
    return NextResponse.json({ error: 'Trop de requetes' }, { status: 429 });
  }

  const rate = await getUsdXafRate();
  return NextResponse.json(
    { rate },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
}
