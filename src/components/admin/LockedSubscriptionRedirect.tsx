'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSubscription } from '@/contexts/SubscriptionContext';

/** La page d'abonnement reste atteignable: c'est la que l'on paie pour repartir. */
const SUBSCRIPTION_PAGE = /\/admin\/subscription(\/|$)/;

/**
 * Renvoie un restaurant gele vers la page d'abonnement, comme le proxy le fait
 * pour `frozen`. Il couvre l'essai expire que le cron de 02:00 n'a pas encore
 * gele (le layout le presente comme `frozen`): le proxy, fichier protege, ne le
 * voit pas.
 *
 * Monte HORS de `AdminContentWrapper`, sur TOUTES les routes admin: accueil,
 * caisse et cuisine comprises. Le wrapper ecarte ses bandeaux sur les pages
 * immersives; ce renvoi, lui, ne doit jamais etre ecarte - sinon la caisse et
 * la cuisine restent affichees alors que chaque ecriture est refusee.
 *
 * OU ARRIVE CHACUN. `/subscription` exige `settings.view`
 * (`src/lib/auth/admin-route-permissions.ts`), garde par le RBAC du proxy et
 * par `requireAdminPermission` dans la page. Par defaut, seuls `owner` et
 * `admin` l'ont: eux arrivent sur la page d'abonnement. Les autres roles
 * (manager, caissier, cuisinier, serveur) sont renvoyes vers `/unauthorized`
 * par le proxy - exactement ce qu'ils obtiennent deja pour un restaurant
 * `frozen`, puisque le proxy les envoie lui aussi vers `/subscription`. Les
 * ecritures restent refusees cote serveur par `tenantLockReason`, ce composant
 * n'est que l'explication.
 */
export function LockedSubscriptionRedirect({ tenantSlug }: { tenantSlug: string }) {
  const { isFrozen } = useSubscription();
  const pathname = usePathname();
  const router = useRouter();
  const onSubscriptionPage = SUBSCRIPTION_PAGE.test(pathname ?? '');

  useEffect(() => {
    if (isFrozen && !onSubscriptionPage) {
      router.replace(`/sites/${tenantSlug}/admin/subscription`);
    }
  }, [isFrozen, onSubscriptionPage, router, tenantSlug]);

  return null;
}
