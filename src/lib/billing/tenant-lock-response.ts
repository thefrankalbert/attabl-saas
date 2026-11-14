import { NextResponse } from 'next/server';
import { assertTenantServing, TenantLockedError } from './assert-tenant-serving';

/**
 * `assertTenantServing` pour les routes API: rend la reponse 403 a renvoyer
 * (avec le message de coupure) quand le restaurant est coupe, `null` sinon.
 * A appeler APRES la preuve d'appartenance et AVANT toute ecriture. Toute autre
 * erreur remonte telle quelle.
 */
export async function tenantLockResponse(tenantId: string): Promise<NextResponse | null> {
  try {
    await assertTenantServing(tenantId);
    return null;
  } catch (err) {
    if (err instanceof TenantLockedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
