import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/** Postgres `undefined_table` et son equivalent PostgREST: la migration n'est pas encore appliquee. */
const MISSING_TABLE_CODES = ['42P01', 'PGRST205'];

/**
 * Le restaurant est-il PAYE par Flutterwave en ce moment ? (une ligne reglee
 * dont la periode n'est pas finie.) Lecture service_role, filtree par restaurant.
 *
 * Le code part en production avant la migration (regle du depot): tant que la
 * table n'existe pas, personne n'a paye par Flutterwave, la reponse est `false`.
 */
async function hasActiveFlutterwavePeriod(tenantId: string, now: Date): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('flutterwave_payments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'successful')
    .gt('period_end', now.toISOString())
    .limit(1);
  if (error) {
    if (MISSING_TABLE_CODES.includes((error as { code?: string }).code ?? '')) return false;
    throw new Error('Lecture des paiements Flutterwave impossible');
  }
  return (data ?? []).length > 0;
}

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
    if (!(await hasActiveFlutterwavePeriod(tenantId, now))) return null;
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
