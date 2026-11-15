import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { hasActiveFlutterwavePeriod } from './active-period';

/**
 * Garde des routes Stripe (checkout, checkout integre, changement de plan): un
 * restaurant deja paye par mobile money ou carte Flutterwave ne doit pas ouvrir
 * un second abonnement Stripe, sinon il paierait deux fois la meme periode.
 * Meme principe, dans l'autre sens, que le refus de `startPayment` face a un
 * abonnement Stripe vivant. Renvoie la reponse de refus, ou `null` si la voie est libre.
 * Echec de lecture: refus 503 (on n'ouvre jamais une caisse dans le doute).
 */
export async function refuseIfPaidByFlutterwave(
  tenantId: string,
  now: Date = new Date(),
): Promise<NextResponse | null> {
  try {
    if (!(await hasActiveFlutterwavePeriod(createAdminClient(), tenantId, now))) return null;
  } catch (error) {
    logger.error('Garde Flutterwave: lecture impossible', error, { tenantId });
    return NextResponse.json(
      { error: 'Verification de l abonnement impossible. Reessayez dans un instant.' },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      error:
        'Ce restaurant est deja abonne par mobile money ou carte. Renouvelez depuis la page Abonnement.',
      code: 'EXISTING_FLUTTERWAVE_SUBSCRIPTION',
    },
    { status: 409 },
  );
}
