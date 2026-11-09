'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSubscription } from '@/contexts/SubscriptionContext';

/** La page d'abonnement reste atteignable: c'est la que l'on paie pour repartir. */
const SUBSCRIPTION_PAGE = /\/admin\/subscription(\/|$)/;

/** La cuisine, ouverte seulement pour finir les commandes d'avant la fin d'essai. */
const KITCHEN_PAGE = /\/admin\/kitchen(\/|$)/;

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
 *
 * EXCEPTION, LA CUISINE (decision produit du 2026-11-09). `kitchenMayFinish`
 * (calcule cote serveur par `kitchenMayFinishForTenant`) vaut `true` quand la
 * coupure vient de la seule fin d'essai, pas encore gelee par le cron: la page
 * cuisine reste alors atteignable, pour finir les commandes passees avant la
 * fin de l'essai. Tout autre verrou, et toute autre page, renvoie comme avant.
 * Une fois l'essai gele (12 h apres sa fin au plus tot), le proxy ferme la
 * cuisine lui aussi.
 */
export function LockedSubscriptionRedirect({
  tenantSlug,
  kitchenMayFinish = false,
}: {
  tenantSlug: string;
  kitchenMayFinish?: boolean;
}) {
  const { isFrozen } = useSubscription();
  const pathname = usePathname();
  const router = useRouter();
  const allowed =
    SUBSCRIPTION_PAGE.test(pathname ?? '') ||
    (kitchenMayFinish && KITCHEN_PAGE.test(pathname ?? ''));

  useEffect(() => {
    if (isFrozen && !allowed) {
      router.replace(`/sites/${tenantSlug}/admin/subscription`);
    }
  }, [isFrozen, allowed, router, tenantSlug]);

  return null;
}
