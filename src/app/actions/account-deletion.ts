'use server';

import { headers } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe/server';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { redirectToLoginAfterAccountDeletion } from '@/lib/auth/redirect-to-main';
import { adminResetLimiter } from '@/lib/rate-limit';
import { CACHE_TAG_TENANT_DOMAIN, tenantConfigTag } from '@/lib/cache-tags';
import { accountDeletionSchema } from '@/lib/validations/account-deletion.schema';
import { createAccountDeletionService } from '@/services/account-deletion.service';
import { ServiceError } from '@/services/errors';
import { logger } from '@/lib/logger';

/**
 * Suppression de compte depuis l'application (Apple 5.1.1(v)).
 *
 * L'identite vient de `auth.getUser()`. Pour le proprietaire, le restaurant vient
 * du slug pose par le middleware (`x-tenant-slug`, jamais l'indice deduit du
 * Referer) et son role de la ligne `admin_users` lue par le service. Le chemin
 * du personnel porte sur le compte entier: il n'a besoin d'aucun restaurant, ce
 * qui le rend utilisable depuis /unauthorized (restaurant gele). Le client
 * n'envoie que le texte de confirmation.
 *
 * Aucune garde de coupure (`assertTenantServing`): un restaurant gele ou impaye
 * doit toujours pouvoir partir.
 *
 * Le client ne recoit qu'un code d'erreur, traduit cote interface: aucun detail
 * interne ne sort.
 */

type AccountDeletionErrorCode =
  'rateLimited' | 'invalid' | 'mismatch' | 'forbidden' | 'ownerMustClose' | 'failed';

/** En cas de succes, l'action ne rend rien: elle redirige vers /login?deleted=true. */
type AccountDeletionResult = { success: false; error: AccountDeletionErrorCode };

function codeFor(err: unknown): AccountDeletionErrorCode {
  if (err instanceof ServiceError) {
    if (err.code === 'VALIDATION') return 'mismatch';
    if (err.code === 'CONFLICT') return 'ownerMustClose';
    if (err.code === 'UNAUTHORIZED' || err.code === 'NOT_FOUND') return 'forbidden';
  }
  return 'failed';
}

async function run(input: unknown, kind: 'owner' | 'staff'): Promise<AccountDeletionResult> {
  const parsed = accountDeletionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'invalid' };

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'forbidden' };

  const { slug, trusted } = readTenantSlug(await headers());
  if (kind === 'owner' && (!slug || !trusted)) return { success: false, error: 'forbidden' };

  // Compartiment destructif et fail-closed, cle par COMPTE: 3 essais par heure.
  const { success: allowed } = await adminResetLimiter.check(`account-deletion:${user.id}`);
  if (!allowed) return { success: false, error: 'rateLimited' };

  const service = createAccountDeletionService({ admin: createAdminClient(), stripe });

  try {
    if (kind === 'owner' && slug) {
      await service.closeOwnerRestaurant({
        userId: user.id,
        tenantSlug: slug,
        confirmation: parsed.data.confirmation,
      });
      // Le restaurant disparait des caches de resolution: les autres membres
      // encore connectes sont renvoyes a la connexion.
      revalidateTag(tenantConfigTag(slug), 'max');
      revalidateTag(CACHE_TAG_TENANT_DOMAIN, 'max');
    } else if (kind === 'staff') {
      await service.deleteStaffAccount({
        userId: user.id,
        confirmation: parsed.data.confirmation,
      });
    }
  } catch (err) {
    if (!(err instanceof ServiceError)) {
      logger.error('Suppression de compte: erreur inattendue', err, { userId: user.id, kind });
    }
    return { success: false, error: codeFor(err) };
  }

  // Deconnexion de CET appareil. Un compte efface ne peut deja plus se
  // reconnecter; un proprietaire d'autres restaurants garde ses autres sessions.
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    logger.warn('Suppression de compte: deconnexion locale incomplete', {
      userId: user.id,
      error: signOutError.message,
    });
  }
  // Redirection serveur (hors du try: elle leve NEXT_REDIRECT). Le nettoyage
  // local de l'appareil est fait par la page de connexion (?deleted=true).
  redirectToLoginAfterAccountDeletion();
}

/** Le proprietaire ferme son restaurant courant (et seulement celui-la). */
export async function actionDeleteOwnerAccount(input: unknown): Promise<AccountDeletionResult> {
  return run(input, 'owner');
}

/** Un membre du personnel supprime son propre compte, dans tous les restaurants. */
export async function actionDeleteStaffAccount(input: unknown): Promise<AccountDeletionResult> {
  return run(input, 'staff');
}
