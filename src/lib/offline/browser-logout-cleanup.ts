'use client';

import { getOrderOutbox, persistOutboxIdentity } from './outbox-idb';
import { getOutboxIdentity } from './outbox-identity';
import { replayOrderEntry } from './submit-order';
import {
  deleteQueryCacheDb,
  prepareLogout,
  type LogoutCleanupResult,
  type PrepareLogoutOptions,
} from './logout-cleanup';

/**
 * Liaison navigateur de prepareLogout (OFF-03). La logique pure et testee vit
 * dans logout-cleanup.ts; ce module ne fait que lui brancher l'outbox reelle,
 * IndexedDB et l'etat reseau.
 */
export async function prepareLogoutInBrowser(
  options: PrepareLogoutOptions = {},
): Promise<LogoutCleanupResult> {
  const outbox = getOrderOutbox();

  // Pas d'IndexedDB (navigateur ancien, mode restreint): il n'y a alors pas de
  // file d'attente possible, donc rien a perdre. On purge et on laisse partir.
  if (!outbox) {
    await deleteQueryCacheDb();
    return { blocked: false, pending: 0, lost: 0 };
  }

  const identity = getOutboxIdentity();

  const result = await prepareLogout(
    {
      // countDrainable et NON count: on ne bloque la deconnexion que sur ce que
      // CETTE session peut envoyer. Compter les entrees d'un autre serveur
      // piegerait l'utilisateur, incapable de les drainer comme de se deconnecter.
      countPending: () =>
        outbox.countDrainable({ userId: identity?.userId, tenantId: identity?.tenantId }),
      drain: async () => {
        const drainResult = await outbox.drain(replayOrderEntry, {
          currentUserId: identity?.userId,
          currentTenantId: identity?.tenantId,
        });
        // permanentlyFailed inclut les entrees EXPIREES, que le drain vient de
        // supprimer. C'est la derniere occasion de les signaler.
        return { lost: drainResult.permanentlyFailed.length };
      },
      deleteQueryCache: deleteQueryCacheDb,
      isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    },
    options,
  );

  // Deconnexion effective: on efface l'identite persistee, sinon le service
  // worker continuerait de drainer au nom d'une session terminee - sans cookie,
  // chaque rejeu partirait en 401. Les entrees, elles, gardent leur proprietaire
  // et repartiront a la prochaine connexion de cette personne sur cette tablette.
  if (!result.blocked) {
    await persistOutboxIdentity(null);
  }

  return result;
}
