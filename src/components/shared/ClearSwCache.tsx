'use client';

import { useEffect } from 'react';
import { deleteQueryCacheDb } from '@/lib/offline/logout-cleanup';

/**
 * Tells the service worker to drop cached authenticated documents/RSC. Rendered
 * on the login page, which is the convergence point of every logged-out state
 * (manual logout, session expiry, redirect) - so a shared restaurant tablet does
 * not retain the previous user's admin pages after they sign out. Structured
 * /api data is never cached (NetworkOnly in the SW); this clears the doc caches
 * that make admin reloadable offline.
 */
export function ClearSwCache() {
  useEffect(() => {
    // Cache de LECTURE TanStack (attabl-query-cache). Il survivait jusqu'ici a la
    // deconnexion, si bien qu'ouvrir l'application avant de se reconnecter
    // repeuplait les ecrans avec le chiffre d'affaires et les commandes de la
    // session precedente. Purge ici plutot qu'au seul clic sur "Deconnexion",
    // parce que /login est le point de convergence de TOUS les etats deconnectes,
    // expiration de session comprise.
    //
    // L'outbox (attabl-offline) n'est deliberement PAS touchee: elle contient des
    // commandes encaissees non encore envoyees. Sa vidange est traitee avant la
    // deconnexion par prepareLogout, qui bloque plutot que de perdre de l'argent.
    void deleteQueryCacheDb();

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.controller?.postMessage({ type: 'attabl-clear-cache' });
  }, []);
  return null;
}
