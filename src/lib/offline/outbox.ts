/**
 * Durable write outbox - isomorphic core (no browser APIs here).
 *
 * Part of the offline-first write layer for salle/resto tablets. When an order
 * write fails because the device is offline (or the network blips), the request
 * is queued durably and replayed on reconnect. Each entry carries a stable
 * client_request_id so a replay is deduped server-side (see migration
 * 20260628010000) instead of creating a duplicate order.
 *
 * This file holds only the queue logic over an injected store, so it can be
 * unit-tested with an in-memory store. The IndexedDB binding lives in
 * outbox-idb.ts (browser-only).
 */

/** A queued write waiting to reach the server. */
export interface OutboxEntry {
  /** Stable idempotency key (UUID). Also sent in the body as client_request_id. */
  id: string;
  /** Same-origin API path to POST to, e.g. '/api/orders' or '/api/orders/pos'. */
  endpoint: string;
  /** JSON body; already includes client_request_id === id. */
  body: unknown;
  /** Epoch ms when first queued. */
  createdAt: number;
  /** Replay attempts so far. */
  attempts: number;
  /** Last error message (network or server), for diagnostics/UI. */
  lastError?: string;
  /**
   * Identite de la session qui a mis l'entree en file (OFF-07). Optionnels: les
   * entrees deja presentes sur les tablettes en service ne les portent pas, et
   * doivent continuer de partir - on ne peut pas deviner leur proprietaire.
   */
  ownerUserId?: string;
  ownerTenantId?: string;
  /**
   * Epoch ms de reservation pour rejeu (OFF-09). Pose atomiquement par
   * `store.claim` au demarrage d'un rejeu, efface quand le rejeu rend la main.
   * Une reservation plus vieille que CLAIM_TTL_MS est consideree abandonnee: le
   * contexte qui la detenait a disparu (onglet ferme, worker tue).
   */
  claimedAt?: number;
  /**
   * Ressource visee, pour garantir l'ordre de rejeu PAR ressource (OFF-08).
   * Ex: `table:<id>`. Sans elle, `drain` continue apres un echec, si bien qu'une
   * entree repoussee s'applique APRES une entree plus recente de la meme
   * ressource. Absente = entree independante, aucun ordre a garantir.
   */
  scopeKey?: string;
}

/** Minimal persistence contract the outbox needs. Implemented by IndexedDB. */
export interface OutboxStore {
  put(entry: OutboxEntry): Promise<void>;
  getAll(): Promise<OutboxEntry[]>;
  delete(id: string): Promise<void>;
  /**
   * Journal des entrees definitivement perdues (OFF-06). Optionnel: un store en
   * memoire (tests) peut s'en passer, le drain degrade alors vers l'ancien
   * comportement "en memoire seulement".
   */
  putRejected?(entry: OutboxEntry): Promise<void>;
  listRejected?(): Promise<OutboxEntry[]>;
  clearRejected?(): Promise<void>;
  /**
   * OFF-09. Reserve une entree pour rejeu, en UNE transaction.
   *
   * Le verrou de `useOrderOutbox` est une ref locale a la page: il ne voit pas
   * le service worker, qui draine dans un contexte distinct. Deux drains
   * pouvaient donc rejouer la meme entree, et surtout le second pouvait la
   * REECRIRE apres que le premier l'ait supprimee - une commande deja partie
   * ressuscitait, et le compteur de commandes en attente affichait un chiffre
   * faux a l'operateur.
   *
   * Renvoie false si l'entree a disparu (deja traitee ailleurs) ou si une
   * reservation non expiree la detient. Optionnel: un store en memoire (tests)
   * peut s'en passer, le drain degrade alors vers l'ancien comportement.
   */
  claim?(id: string, now: number, ttlMs: number): Promise<boolean>;
  /**
   * OFF-09. Ecrit une entree SEULEMENT si elle est encore en file, en UNE
   * transaction. C'est ce qui empeche la resurrection: un `put` inconditionnel
   * recree l'entree supprimee entre-temps par l'autre contexte.
   */
  putIfPresent?(entry: OutboxEntry): Promise<boolean>;
}

/** Outcome of replaying one entry against the server. */
export type ReplayOutcome =
  | { kind: 'success' } // 2xx - server accepted (or deduped); drop the entry.
  | { kind: 'permanent'; reason: string } // 4xx business reject; drop + surface.
  // offline / 5xx / 429; keep for later. countsAsAttempt=false (default for a
  // pure network-unreachable failure) means "don't burn the attempt budget" -
  // only server-answered transients should count toward MAX_ATTEMPTS.
  | { kind: 'retry'; reason: string; countsAsAttempt?: boolean };

/** Replays one entry. Provided by the caller (browser fetch in production). */
export type ReplayFn = (entry: OutboxEntry) => Promise<ReplayOutcome>;

/** Stop retrying an entry after this many attempts (avoid infinite loops). */
export const MAX_ATTEMPTS = 12;

/**
 * Duree de vie d'une entree en file (OFF-06).
 *
 * `createdAt` etait stocke mais servait UNIQUEMENT au tri: aucune expiration.
 * Combine au fait qu'un echec reseau pur ne consomme pas le budget de tentatives
 * (ce qui est voulu, sinon une panne longue detruirait les commandes), une entree
 * etait immortelle.
 *
 * Scenario: le routeur meurt samedi 22h30, la tablette garde 11 commandes en
 * file, personne ne rallume avant lundi. Lundi 9h les 11 commandes de samedi soir
 * sont creees avec l'horodatage de lundi, tombent sur l'ecran cuisine du
 * petit-dejeuner, destockent l'inventaire de lundi et polluent le chiffre
 * d'affaires du jour. `create_order_with_items` n'a aucune notion d'anciennete.
 *
 * 6 heures = l'horizon d'un service. Au-dela, la commande ne doit plus partir
 * toute seule: elle remonte a l'operateur via permanentlyFailed (bandeau rouge
 * "commandes non synchronisees"), qui decide de la ressaisir ou non.
 */
export const MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Duree de vie d'une reservation de rejeu (OFF-09).
 *
 * 60 secondes: largement au-dessus d'un aller-retour reseau, meme sur un lien
 * degrade, et assez court pour qu'une entree reservee par un contexte disparu
 * (onglet ferme, service worker tue en plein rejeu) reparte au drain suivant
 * plutot que de rester bloquee jusqu'a MAX_AGE_MS.
 */
export const CLAIM_TTL_MS = 60 * 1000;

/**
 * Plafond de taille de la file (OFF-06).
 *
 * Sans plafond, une panne prolongee ou une boucle de rejeu remplit le quota
 * IndexedDB de la tablette; le navigateur commence alors a refuser les ecritures,
 * et c'est la file elle-meme qui casse - donc l'inverse de ce qu'elle protege.
 * Au-dela, mieux vaut refuser franchement la mise en file et le dire au caissier
 * que de faire semblant.
 */
export const MAX_ENTRIES = 500;

export interface DrainResult {
  succeeded: number;
  permanentlyFailed: OutboxEntry[];
  stillQueued: number;
  /**
   * Entrees laissees en file parce qu'elles appartiennent a une AUTRE session
   * (OFF-07). Elles ne sont ni rejouees ni supprimees: elles attendent que leur
   * proprietaire revienne. L'interface peut ainsi dire "N commandes d'une autre
   * session" au lieu de laisser un compteur qui ne descend jamais sans raison.
   */
  skippedForeign: number;
}

/**
 * La session donnee peut-elle rejouer cette entree (OFF-07) ?
 *
 * Predicat UNIQUE, partage par `drain` et `countDrainable`. Les deux doivent
 * repondre exactement la meme chose: si `drain` refuse de rejouer une entree que
 * `countDrainable` compte comme en attente, la deconnexion se bloque pour de bon
 * (le compteur ne descend jamais) et l'operateur est piege.
 *
 * Une entree sans proprietaire (mise en file avant cette version) est rejouable
 * par tout le monde: on ne peut pas deviner a qui elle appartient, et la bloquer
 * definitivement serait pire que de la faire partir.
 */
export function canReplayEntry(
  entry: OutboxEntry,
  currentUserId?: string,
  currentTenantId?: string,
): boolean {
  if (entry.ownerUserId && entry.ownerUserId !== currentUserId) return false;
  if (entry.ownerTenantId && entry.ownerTenantId !== currentTenantId) return false;
  return true;
}

/**
 * Reecrit une entree qui reste en file apres un rejeu infructueux (OFF-09).
 *
 * Deux choses en une: la reservation est rendue (`claimedAt` efface, l'entree
 * repart au drain suivant sans attendre CLAIM_TTL_MS), et l'ecriture ne recree
 * pas une entree supprimee entre-temps par l'autre contexte de drain.
 *
 * `putIfPresent` est optionnel: un store qui ne l'implemente pas retombe sur
 * l'ancien comportement, ce qui reste correct quand il n'y a qu'un seul drain.
 */
async function writeBack(store: OutboxStore, entry: OutboxEntry): Promise<void> {
  const released: OutboxEntry = { ...entry };
  delete released.claimedAt;
  if (store.putIfPresent) {
    await store.putIfPresent(released);
    return;
  }
  await store.put(released);
}

export function createOutbox(store: OutboxStore) {
  return {
    /**
     * Queue a write. Returns the stored entry, ou `null` si la file est pleine
     * (MAX_ENTRIES): l'appelant doit alors signaler un echec franc plutot que de
     * laisser croire que l'ecriture est en securite.
     */
    async enqueue(input: {
      id: string;
      endpoint: string;
      body: unknown;
      now: number;
      ownerUserId?: string;
      ownerTenantId?: string;
      scopeKey?: string;
    }): Promise<OutboxEntry | null> {
      const existing = await store.getAll();
      // Un rejeu de la MEME cle n'est pas un ajout: il doit pouvoir passer meme a
      // plafond atteint, sinon on perdrait l'entree qu'on cherche a mettre a jour.
      const isNew = !existing.some((e) => e.id === input.id);
      if (isNew && existing.length >= MAX_ENTRIES) {
        return null;
      }

      const entry: OutboxEntry = {
        id: input.id,
        endpoint: input.endpoint,
        body: input.body,
        createdAt: input.now,
        attempts: 0,
        ownerUserId: input.ownerUserId,
        ownerTenantId: input.ownerTenantId,
        scopeKey: input.scopeKey,
      };
      await store.put(entry);
      return entry;
    },

    /** All queued entries, oldest first. id breaks createdAt ties deterministically. */
    async list(): Promise<OutboxEntry[]> {
      const all = await store.getAll();
      return all.sort(
        (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    },

    async count(): Promise<number> {
      return (await store.getAll()).length;
    },

    /**
     * Entrees que la session donnee peut REELLEMENT faire partir.
     *
     * A utiliser partout ou l'on bloque l'utilisateur sur "il reste des choses a
     * envoyer" - typiquement la deconnexion (OFF-03). Compter toutes les entrees
     * y inclurait celles d'un autre serveur, que cette session ne peut pas
     * drainer (OFF-07): le compteur ne descendrait jamais et l'utilisateur ne
     * pourrait plus se deconnecter. C'est justement le cas ou il en a besoin,
     * puisque ce n'est pas son compte.
     */
    async countDrainable(identity?: { userId?: string; tenantId?: string }): Promise<number> {
      const all = await store.getAll();
      return all.filter((e) => canReplayEntry(e, identity?.userId, identity?.tenantId)).length;
    },

    async remove(id: string): Promise<void> {
      await store.delete(id);
    },

    /**
     * Replay every queued entry once, oldest first. On success or permanent
     * rejection the entry is removed; on a retryable error it is kept with an
     * incremented attempt count (dropped once it exceeds MAX_ATTEMPTS, reported
     * via permanentlyFailed so the UI can warn the operator). Sequential by
     * design: order matters (a table's orders should replay in sequence) and it
     * avoids hammering a just-recovered network.
     */
    async drain(
      replay: ReplayFn,
      options?: { now?: number; currentUserId?: string; currentTenantId?: string },
    ): Promise<DrainResult> {
      const entries = await this.list();
      const now = options?.now ?? Date.now();
      const currentUserId = options?.currentUserId;
      const currentTenantId = options?.currentTenantId;
      let succeeded = 0;
      let skippedForeign = 0;
      const permanentlyFailed: OutboxEntry[] = [];
      // Ressources dont une entree vient d'etre repoussee (OFF-08). Tant qu'une
      // entree d'un scope n'est pas passee, on ne joue pas les suivantes du meme
      // scope, sinon elles s'appliqueraient dans le desordre. Les autres
      // ressources continuent en parallele.
      const blockedScopes = new Set<string>();

      for (const entry of entries) {
        if (entry.scopeKey && blockedScopes.has(entry.scopeKey)) {
          continue;
        }

        // Cloisonnement par session (OFF-07). On ne rejoue pas la commande d'un
        // autre serveur: elle serait enregistree sous l'identite courante, ou pire
        // detruite si le tenant differe. Une entree sans proprietaire connu
        // (mise en file avant cette version) reste rejouee: on ne peut pas
        // deviner, et la perdre serait pire.
        // Cloisonnement par session (OFF-07). Le cas tenant est le PLUS
        // destructeur: sur une tablette partagee entre deux etablissements du
        // meme groupe, rejouer une commande de A sous la session de B fait
        // repondre 400 "articles plus disponibles" (les menu_item_id n'existent
        // pas chez B), ce que classifyStatus classe en `permanent` - la commande
        // est alors supprimee definitivement.
        //
        // Le predicat refuse AUSSI quand aucune identite n'est fournie: le drain
        // du service worker (Background Sync) tourne sans React, donc sans
        // identite, et le laisser rejouer une entree nominative reviendrait a la
        // faire partir sous une session inconnue.
        //
        // Le service worker, lui, relit l'identite persistee dans IndexedDB
        // (outbox-idb.ts, store `identity`) et la passe ici: la synchro en
        // arriere-plan continue donc de fonctionner. Sans cela son drain serait
        // inerte, et les entrees finiraient par depasser MAX_AGE_MS - une
        // degradation se serait transformee en perte seche.
        if (!canReplayEntry(entry, currentUserId, currentTenantId)) {
          skippedForeign += 1;
          // Le scope reste BLOQUE: sauter une entree etrangere sans bloquer sa
          // ressource rouvrirait exactement le desordre que scopeKey empeche.
          // Fatou met en file `release(table 5)`, sa session tombe; Ibrahim met
          // en file `assign(table 5)`. Sans cette ligne, l'assign d'Ibrahim part,
          // puis le release de Fatou s'applique plus tard et libere une table
          // assignee 20 minutes plus tot.
          if (entry.scopeKey) blockedScopes.add(entry.scopeKey);
          continue;
        }

        // Expiration AVANT tout appel reseau: une commande trop vieille ne doit
        // pas partir toute seule, meme si le serveur l'accepterait volontiers.
        if (now - entry.createdAt > MAX_AGE_MS) {
          try {
            await store.delete(entry.id);
            permanentlyFailed.push({ ...entry, lastError: 'expired' });
          } catch {
            // Suppression impossible: on laisse l'entree, elle expirera au drain
            // suivant. Surtout ne pas la rejouer.
          }
          continue;
        }

        // OFF-09. Reservation atomique AVANT le reseau. Sans elle, le drain de
        // la page et celui du service worker rejouent la meme entree, et le
        // perdant reecrit une entree que le gagnant vient de supprimer: la
        // commande ressuscite et le compteur ment a l'operateur.
        if (store.claim) {
          const reserved = await store.claim(entry.id, now, CLAIM_TTL_MS);
          if (!reserved) {
            // Un autre contexte s'en occupe (ou l'a deja traitee). Sa ressource
            // reste bloquee: laisser passer la suivante casserait l'ordre par
            // ressource que scopeKey garantit.
            if (entry.scopeKey) blockedScopes.add(entry.scopeKey);
            continue;
          }
        }

        let outcome: ReplayOutcome;
        try {
          outcome = await replay(entry);
        } catch (err) {
          // A thrown replay is treated as network-unreachable: keep, don't burn.
          outcome = {
            kind: 'retry',
            reason: err instanceof Error ? err.message : String(err),
            countsAsAttempt: false,
          };
        }

        // Isolate each entry's store mutation: one IndexedDB hiccup must not
        // abort the rest of the batch (the entry just gets retried next drain).
        try {
          if (outcome.kind === 'success') {
            await store.delete(entry.id);
            succeeded += 1;
            continue;
          }

          if (outcome.kind === 'permanent') {
            await store.delete(entry.id);
            permanentlyFailed.push({ ...entry, lastError: outcome.reason });
            continue;
          }

          // retryable: only count toward the attempt budget when the server
          // actually answered (countsAsAttempt !== false). Pure network failures
          // keep the entry indefinitely without dropping it.
          if (outcome.countsAsAttempt === false) {
            await writeBack(store, { ...entry, lastError: outcome.reason });
            if (entry.scopeKey) blockedScopes.add(entry.scopeKey);
            continue;
          }
          const attempts = entry.attempts + 1;
          if (attempts > MAX_ATTEMPTS) {
            await store.delete(entry.id);
            permanentlyFailed.push({ ...entry, attempts, lastError: outcome.reason });
            continue;
          }
          await writeBack(store, { ...entry, attempts, lastError: outcome.reason });
          // L'entree reste en file: tout ce qui vise la meme ressource attend son
          // tour, sinon le rejeu d'un `release` s'appliquerait apres un `assign`
          // plus recent et la table se retrouverait sans serveur.
          if (entry.scopeKey) blockedScopes.add(entry.scopeKey);
        } catch {
          // Store op failed for this entry; leave it queued and move on.
          continue;
        }
      }

      // OFF-06: une entree perdue doit SURVIVRE au contexte qui l'a constatee.
      // Sans ce journal, `permanentlyFailed` n'existait que dans la valeur de
      // retour: le drain du service worker (Background Sync) la jetait purement
      // et simplement, et cote page elle ne vivait que dans un state React,
      // efface au premier rechargement. Une commande ENCAISSEE expiree a
      // MAX_AGE_MS disparaissait donc sans que personne ne le voie, compteur
      // revenu a zero - exactement le trou en caisse que ce lot doit rendre
      // visible. On persiste ici, en un seul endroit, pour que les deux
      // appelants en beneficient sans avoir a y penser.
      if (permanentlyFailed.length > 0 && store.putRejected) {
        for (const entry of permanentlyFailed) {
          try {
            await store.putRejected(entry);
          } catch {
            // Journal indisponible: on ne perd pas le drain pour autant, la
            // valeur de retour reste exacte pour l'appelant en cours.
          }
        }
      }

      const stillQueued = (await store.getAll()).length;
      return { succeeded, permanentlyFailed, stillQueued, skippedForeign };
    },

    /**
     * Entrees perdues consignees par les drains precedents, y compris ceux du
     * service worker. C'est ce qui permet au bandeau d'alerte de reapparaitre
     * apres un rechargement de page.
     */
    async listRejected(): Promise<OutboxEntry[]> {
      return (await store.listRejected?.()) ?? [];
    },

    /** Vide le journal une fois que l'operateur a pris connaissance des pertes. */
    async clearRejected(): Promise<void> {
      await store.clearRejected?.();
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
