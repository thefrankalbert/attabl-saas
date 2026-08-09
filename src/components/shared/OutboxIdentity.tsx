'use client';

import { useEffect } from 'react';
import { setOutboxIdentity } from '@/lib/offline/outbox-identity';
import { persistOutboxIdentity } from '@/lib/offline/outbox-idb';

interface OutboxIdentityProps {
  userId?: string;
  tenantId: string;
}

/**
 * Publie l'identite du poste vers la file d'attente hors ligne (OFF-07).
 *
 * Monte dans le shell admin, qui connait deja l'utilisateur et le tenant cote
 * serveur. Sans ca, une commande mise en file par un serveur pourrait etre
 * rejouee sous la session du suivant.
 */
export function OutboxIdentity({ userId, tenantId }: OutboxIdentityProps) {
  useEffect(() => {
    if (!userId) return;
    setOutboxIdentity({ userId, tenantId });
    // Persistee aussi: le service worker draine hors contexte React et ne peut
    // pas lire le module. Sans ca son drain serait inerte (voir outbox-idb.ts).
    void persistOutboxIdentity({ userId, tenantId });
    // Au demontage on efface: la page suivante republiera la sienne. Laisser une
    // identite perimee serait pire que ne pas en avoir.
    return () => setOutboxIdentity(null);
  }, [userId, tenantId]);

  return null;
}
