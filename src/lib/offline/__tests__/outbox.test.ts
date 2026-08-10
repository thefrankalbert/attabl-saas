import { describe, it, expect } from 'vitest';
import {
  createOutbox,
  MAX_ATTEMPTS,
  MAX_AGE_MS,
  CLAIM_TTL_MS,
  MAX_ENTRIES,
  type OutboxEntry,
  type OutboxStore,
  type ReplayOutcome,
} from '../outbox';

/** In-memory OutboxStore for testing the pure queue logic. */
function memoryStore(seed: OutboxEntry[] = []): OutboxStore {
  const map = new Map<string, OutboxEntry>(seed.map((e) => [e.id, e]));
  return {
    async put(entry) {
      map.set(entry.id, entry);
    },
    async getAll() {
      return [...map.values()];
    },
    async delete(id) {
      map.delete(id);
    },
  };
}

/**
 * Store QUI JOURNALISE, comme l'implementation IndexedDB reelle. Le store
 * memoire ci-dessus n'implemente pas les methodes optionnelles: il sert de
 * temoin pour verifier que le drain degrade proprement sans journal.
 */
function journalingStore(seed: OutboxEntry[] = []): OutboxStore & { rejected: OutboxEntry[] } {
  const base = memoryStore(seed);
  const rejected: OutboxEntry[] = [];
  return {
    ...base,
    rejected,
    async putRejected(entry) {
      rejected.push(entry);
    },
    async listRejected() {
      return [...rejected];
    },
    async clearRejected() {
      rejected.length = 0;
    },
  };
}

// Horloge de drain calee sur les entrees de test (createdAt 0 a 3): sans elle,
// Date.now() rendrait toutes les entrees plus vieilles que MAX_AGE_MS et le drain
// les expirerait avant meme de les rejouer.
const CLOCK = { now: 0 };

function entry(id: string, createdAt = 0): OutboxEntry {
  return {
    id,
    endpoint: '/api/orders/pos',
    body: { client_request_id: id },
    createdAt,
    attempts: 0,
  };
}

describe('createOutbox', () => {
  it('enqueues and lists oldest-first', async () => {
    const store = memoryStore();
    const ob = createOutbox(store);
    await ob.enqueue({ id: 'b', endpoint: '/x', body: {}, now: 200 });
    await ob.enqueue({ id: 'a', endpoint: '/x', body: {}, now: 100 });

    const list = await ob.list();
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
    expect(await ob.count()).toBe(2);
  });

  it('drops an entry on success', async () => {
    const store = memoryStore([entry('a')]);
    const ob = createOutbox(store);
    const result = await ob.drain(async () => ({ kind: 'success' }) as ReplayOutcome, CLOCK);

    expect(result.succeeded).toBe(1);
    expect(result.stillQueued).toBe(0);
    expect(await ob.count()).toBe(0);
  });

  it('drops and reports an entry on permanent rejection', async () => {
    const store = memoryStore([entry('a')]);
    const ob = createOutbox(store);
    const result = await ob.drain(
      async () => ({ kind: 'permanent', reason: 'price changed' }) as ReplayOutcome,
      CLOCK,
    );

    expect(result.succeeded).toBe(0);
    expect(result.permanentlyFailed).toHaveLength(1);
    expect(result.permanentlyFailed[0]?.lastError).toBe('price changed');
    expect(await ob.count()).toBe(0);
  });

  it('keeps and increments attempts on a retryable error', async () => {
    const store = memoryStore([entry('a')]);
    const ob = createOutbox(store);
    const result = await ob.drain(
      async () => ({ kind: 'retry', reason: 'http_503', countsAsAttempt: true }) as ReplayOutcome,
      CLOCK,
    );

    expect(result.stillQueued).toBe(1);
    expect(result.permanentlyFailed).toHaveLength(0);
    const [kept] = await ob.list();
    expect(kept?.attempts).toBe(1);
    expect(kept?.lastError).toBe('http_503');
  });

  it('keeps a network-unreachable retry WITHOUT burning an attempt', async () => {
    const store = memoryStore([{ ...entry('a'), attempts: MAX_ATTEMPTS }]);
    const ob = createOutbox(store);
    const result = await ob.drain(
      async () => ({ kind: 'retry', reason: 'network', countsAsAttempt: false }) as ReplayOutcome,
      CLOCK,
    );

    // At MAX_ATTEMPTS already, but a pure-network failure must not drop the order.
    expect(result.stillQueued).toBe(1);
    expect(result.permanentlyFailed).toHaveLength(0);
    const [kept] = await ob.list();
    expect(kept?.attempts).toBe(MAX_ATTEMPTS); // unchanged
    expect(kept?.lastError).toBe('network');
  });

  it('treats a thrown replay as network-unreachable (kept, not counted)', async () => {
    const store = memoryStore([entry('a')]);
    const ob = createOutbox(store);
    const result = await ob.drain(async () => {
      throw new Error('boom');
    }, CLOCK);

    expect(result.stillQueued).toBe(1);
    const [kept] = await ob.list();
    expect(kept?.attempts).toBe(0);
  });

  it('gives up after MAX_ATTEMPTS retries', async () => {
    const store = memoryStore([{ ...entry('a'), attempts: MAX_ATTEMPTS }]);
    const ob = createOutbox(store);
    const result = await ob.drain(
      async () => ({ kind: 'retry', reason: 'still offline' }) as ReplayOutcome,
      CLOCK,
    );

    expect(result.stillQueued).toBe(0);
    expect(result.permanentlyFailed).toHaveLength(1);
    expect(result.permanentlyFailed[0]?.attempts).toBe(MAX_ATTEMPTS + 1);
  });

  it('processes a mixed batch correctly', async () => {
    const store = memoryStore([entry('ok', 1), entry('reject', 2), entry('retry', 3)]);
    const ob = createOutbox(store);
    const result = await ob.drain(async (e) => {
      if (e.id === 'ok') return { kind: 'success' };
      if (e.id === 'reject') return { kind: 'permanent', reason: 'no' };
      return { kind: 'retry', reason: 'later' };
    }, CLOCK);

    expect(result.succeeded).toBe(1);
    expect(result.permanentlyFailed.map((e) => e.id)).toEqual(['reject']);
    expect(result.stillQueued).toBe(1);
    expect((await ob.list()).map((e) => e.id)).toEqual(['retry']);
  });
  // --- OFF-06: expiration et plafond ------------------------------------

  it('expire une entree trop vieille SANS la rejouer et la remonte a l operateur', async () => {
    // Le routeur meurt samedi 22h30, personne ne rallume avant lundi. Ces
    // commandes ne doivent pas tomber sur l ecran cuisine du petit-dejeuner.
    const store = memoryStore([entry('vieille', 0)]);
    const ob = createOutbox(store);
    let replayed = false;

    const result = await ob.drain(
      async () => {
        replayed = true;
        return { kind: 'success' } as ReplayOutcome;
      },
      { now: MAX_AGE_MS + 1 },
    );

    expect(replayed).toBe(false); // jamais envoyee au serveur
    expect(result.succeeded).toBe(0);
    expect(result.permanentlyFailed.map((e) => e.id)).toEqual(['vieille']);
    expect(result.permanentlyFailed[0]?.lastError).toBe('expired');
    expect(await ob.count()).toBe(0);
  });

  it('rejoue normalement une entree juste sous la limite d age', async () => {
    const store = memoryStore([entry('recente', 0)]);
    const ob = createOutbox(store);

    const result = await ob.drain(async () => ({ kind: 'success' }) as ReplayOutcome, {
      now: MAX_AGE_MS,
    });

    expect(result.succeeded).toBe(1);
  });

  it('refuse la mise en file au dela du plafond', async () => {
    const seed = Array.from({ length: MAX_ENTRIES }, (_, i) => entry(`e${i}`));
    const ob = createOutbox(memoryStore(seed));

    const refused = await ob.enqueue({ id: 'de-trop', endpoint: '/x', body: {}, now: 0 });

    expect(refused).toBeNull();
    expect(await ob.count()).toBe(MAX_ENTRIES);
  });

  it('laisse passer la mise a jour d une cle DEJA en file meme a plafond atteint', async () => {
    // Sinon un rejeu ne pourrait plus mettre a jour son propre compteur de
    // tentatives, et l entree deviendrait impossible a faire evoluer.
    const seed = Array.from({ length: MAX_ENTRIES }, (_, i) => entry(`e${i}`));
    const ob = createOutbox(memoryStore(seed));

    const updated = await ob.enqueue({ id: 'e0', endpoint: '/x', body: { v: 2 }, now: 5 });

    expect(updated).not.toBeNull();
    expect(await ob.count()).toBe(MAX_ENTRIES);
  });
  // --- OFF-07: cloisonnement par session --------------------------------

  it('ne rejoue PAS la commande d un autre serveur et la laisse en file', async () => {
    // Fatou met 3 commandes en file, sa session expire, Ibrahim se connecte sur
    // la meme tablette. Rejouer sous sa session mettrait server_id = Ibrahim.
    const store = memoryStore([
      { ...entry('fatou'), ownerUserId: 'user-fatou', ownerTenantId: 't1' },
      { ...entry('ibrahim'), ownerUserId: 'user-ibrahim', ownerTenantId: 't1' },
    ]);
    const ob = createOutbox(store);
    const replayed: string[] = [];

    const result = await ob.drain(
      async (e) => {
        replayed.push(e.id);
        return { kind: 'success' } as ReplayOutcome;
      },
      { now: 0, currentUserId: 'user-ibrahim', currentTenantId: 't1' },
    );

    expect(replayed).toEqual(['ibrahim']);
    expect(result.skippedForeign).toBe(1);
    expect(result.succeeded).toBe(1);
    // La commande de Fatou est CONSERVEE, pas detruite.
    expect((await ob.list()).map((e) => e.id)).toEqual(['fatou']);
  });

  it('ne rejoue PAS une entree d un autre tenant (sinon elle serait detruite)', async () => {
    // Tablette partagee entre deux etablissements du meme groupe: chez le tenant
    // B les menu_item_id de A n existent pas -> 400 -> classe permanent -> perdu.
    const store = memoryStore([
      { ...entry('resto-a'), ownerUserId: 'u1', ownerTenantId: 'tenant-a' },
    ]);
    const ob = createOutbox(store);
    let replayed = false;

    const result = await ob.drain(
      async () => {
        replayed = true;
        return { kind: 'permanent', reason: 'articles indisponibles' } as ReplayOutcome;
      },
      { now: 0, currentUserId: 'u1', currentTenantId: 'tenant-b' },
    );

    expect(replayed).toBe(false);
    expect(result.skippedForeign).toBe(1);
    expect(result.permanentlyFailed).toHaveLength(0);
    expect(await ob.count()).toBe(1);
  });

  it('rejoue les entrees sans proprietaire connu (mises en file avant cette version)', async () => {
    const store = memoryStore([entry('legacy')]);
    const ob = createOutbox(store);

    const result = await ob.drain(async () => ({ kind: 'success' }) as ReplayOutcome, {
      now: 0,
      currentUserId: 'u-nouveau',
      currentTenantId: 't-nouveau',
    });

    expect(result.succeeded).toBe(1);
    expect(result.skippedForeign).toBe(0);
  });
  // --- OFF-08: ordre de rejeu par ressource -----------------------------

  it('bloque les entrees suivantes de la MEME table quand une est repoussee', async () => {
    // Le manager libere la table 5 puis la reassigne. Si le release repart en
    // retry et que l assign passe quand meme, le release s appliquera au drain
    // suivant et la table se retrouvera sans serveur.
    const store = memoryStore([
      { ...entry('release-t5', 1), scopeKey: 'table:5' },
      { ...entry('assign-t5', 2), scopeKey: 'table:5' },
      { ...entry('assign-t9', 3), scopeKey: 'table:9' },
    ]);
    const ob = createOutbox(store);
    const replayed: string[] = [];

    const result = await ob.drain(
      async (e) => {
        replayed.push(e.id);
        return e.id === 'release-t5'
          ? ({ kind: 'retry', reason: 'http_409', countsAsAttempt: true } as ReplayOutcome)
          : ({ kind: 'success' } as ReplayOutcome);
      },
      { now: 3 },
    );

    // assign-t5 n est PAS joue: il attend que release-t5 passe.
    expect(replayed).toEqual(['release-t5', 'assign-t9']);
    // La table 9 avance quand meme: le blocage est par ressource, pas global.
    expect(result.succeeded).toBe(1);
    expect((await ob.list()).map((e) => e.id).sort()).toEqual(['assign-t5', 'release-t5']);
  });

  it('ne bloque rien pour les entrees sans scope (creations de commande)', async () => {
    const store = memoryStore([entry('cmd1', 1), entry('cmd2', 2)]);
    const ob = createOutbox(store);
    const replayed: string[] = [];

    await ob.drain(
      async (e) => {
        replayed.push(e.id);
        return e.id === 'cmd1'
          ? ({ kind: 'retry', reason: 'http_503', countsAsAttempt: true } as ReplayOutcome)
          : ({ kind: 'success' } as ReplayOutcome);
      },
      { now: 2 },
    );

    expect(replayed).toEqual(['cmd1', 'cmd2']);
  });
  // --- Contre-audit: les deux trous trouves apres coup -------------------

  it('ne rejoue PAS une entree nominative quand aucune identite n est fournie', async () => {
    // C est le cas du service worker (Background Sync): il draine sans React,
    // donc sans identite. Avant correction il rejouait tout, ce qui contournait
    // entierement le cloisonnement par session.
    const store = memoryStore([{ ...entry('a-fatou'), ownerUserId: 'fatou', ownerTenantId: 't1' }]);
    const ob = createOutbox(store);
    let replayed = false;

    const result = await ob.drain(
      async () => {
        replayed = true;
        return { kind: 'success' } as ReplayOutcome;
      },
      { now: 0 },
    );

    expect(replayed).toBe(false);
    expect(result.skippedForeign).toBe(1);
    expect(await ob.count()).toBe(1); // conservee, pas detruite
  });

  it('countDrainable ne compte que ce que la session peut reellement envoyer', async () => {
    // Sans ca, la deconnexion se bloque pour toujours: on compte une entree que
    // l on refuse de drainer, donc le compteur ne descend jamais et l utilisateur
    // est piege - justement quand ce n est pas son compte.
    const store = memoryStore([
      { ...entry('a-fatou'), ownerUserId: 'fatou', ownerTenantId: 't1' },
      { ...entry('b-ibrahim'), ownerUserId: 'ibrahim', ownerTenantId: 't1' },
      entry('c-legacy'),
    ]);
    const ob = createOutbox(store);

    expect(await ob.count()).toBe(3);
    expect(await ob.countDrainable({ userId: 'ibrahim', tenantId: 't1' })).toBe(2);
    // Sans identite (worker), seules les entrees sans proprietaire sont drainables.
    expect(await ob.countDrainable()).toBe(1);
  });

  it('countDrainable et drain sont d accord (sinon deconnexion bloquee a vie)', async () => {
    const store = memoryStore([
      { ...entry('a-fatou'), ownerUserId: 'fatou', ownerTenantId: 't1' },
      { ...entry('b-ibrahim'), ownerUserId: 'ibrahim', ownerTenantId: 't1' },
    ]);
    const ob = createOutbox(store);
    const identity = { userId: 'ibrahim', tenantId: 't1' };

    const before = await ob.countDrainable(identity);
    await ob.drain(async () => ({ kind: 'success' }) as ReplayOutcome, {
      now: 0,
      currentUserId: identity.userId,
      currentTenantId: identity.tenantId,
    });
    const after = await ob.countDrainable(identity);

    expect(before).toBe(1);
    expect(after).toBe(0); // ce que drain accepte de jouer, countDrainable le comptait
  });
  it('une entree ETRANGERE bloque quand meme sa ressource (OFF-07 ne doit pas defaire OFF-08)', async () => {
    // Fatou met en file release(table 5) a 19h00, sa session tombe. Ibrahim met
    // en file assign(table 5) a 19h05. Si l assign d Ibrahim part alors que le
    // release de Fatou est simplement saute, le release s appliquera plus tard et
    // liberera une table assignee 20 minutes plus tot.
    const store = memoryStore([
      {
        ...entry('release-fatou', 1),
        scopeKey: 'table:5',
        ownerUserId: 'fatou',
        ownerTenantId: 't1',
      },
      {
        ...entry('assign-ibrahim', 2),
        scopeKey: 'table:5',
        ownerUserId: 'ibrahim',
        ownerTenantId: 't1',
      },
      {
        ...entry('autre-table', 3),
        scopeKey: 'table:9',
        ownerUserId: 'ibrahim',
        ownerTenantId: 't1',
      },
    ]);
    const ob = createOutbox(store);
    const replayed: string[] = [];

    const result = await ob.drain(
      async (e) => {
        replayed.push(e.id);
        return { kind: 'success' } as ReplayOutcome;
      },
      { now: 3, currentUserId: 'ibrahim', currentTenantId: 't1' },
    );

    // La table 5 est gelee tant que le release de Fatou n est pas parti.
    expect(replayed).toEqual(['autre-table']);
    expect(result.skippedForeign).toBe(1);
    expect((await ob.list()).map((e) => e.id).sort()).toEqual(['assign-ibrahim', 'release-fatou']);
  });
});

/**
 * OFF-06. Une perte doit survivre au contexte qui l'a constatee: le drain du
 * service worker jetait la valeur de retour, et cote page elle ne vivait que
 * dans un state React efface au rechargement. Une commande ENCAISSEE pouvait
 * donc disparaitre sans laisser de trace.
 */
describe('journal des pertes definitives', () => {
  it('consigne une entree expiree, pas seulement dans la valeur de retour', async () => {
    const store = journalingStore([
      { id: 'vieille', endpoint: '/x', body: {}, createdAt: 0, attempts: 0 },
    ]);
    const ob = createOutbox(store);

    const result = await ob.drain(async () => ({ kind: 'success' }) as ReplayOutcome, {
      now: MAX_AGE_MS + 1,
    });

    expect(result.permanentlyFailed.map((e) => e.id)).toEqual(['vieille']);
    // Le point du correctif: relisible APRES coup, par un autre contexte.
    expect((await ob.listRejected()).map((e) => e.id)).toEqual(['vieille']);
    expect((await ob.listRejected())[0].lastError).toBe('expired');
  });

  it('consigne un rejet serveur definitif', async () => {
    const store = journalingStore([
      { id: 'refusee', endpoint: '/x', body: {}, createdAt: 0, attempts: 0 },
    ]);
    const ob = createOutbox(store);

    await ob.drain(async () => ({ kind: 'permanent', reason: 'articles indisponibles' }), {
      now: 1,
    });

    const journal = await ob.listRejected();
    expect(journal).toHaveLength(1);
    expect(journal[0].lastError).toBe('articles indisponibles');
  });

  it('vide le journal quand l operateur a pris connaissance des pertes', async () => {
    const store = journalingStore([
      { id: 'refusee', endpoint: '/x', body: {}, createdAt: 0, attempts: 0 },
    ]);
    const ob = createOutbox(store);
    await ob.drain(async () => ({ kind: 'permanent', reason: 'refus' }), { now: 1 });
    expect(await ob.listRejected()).toHaveLength(1);

    await ob.clearRejected();

    expect(await ob.listRejected()).toEqual([]);
  });

  it('degrade sans casser quand le store ne journalise pas', async () => {
    // Temoin: un store sans les methodes optionnelles (SSR, IndexedDB bloque)
    // doit continuer de drainer, en retombant sur l ancien comportement.
    const store = memoryStore([
      { id: 'refusee', endpoint: '/x', body: {}, createdAt: 0, attempts: 0 },
    ]);
    const ob = createOutbox(store);

    const result = await ob.drain(async () => ({ kind: 'permanent', reason: 'refus' }), {
      now: 1,
    });

    expect(result.permanentlyFailed).toHaveLength(1);
    expect(await ob.listRejected()).toEqual([]);
  });
});

/**
 * Store qui implemente la reservation atomique, comme l'IndexedDB reelle.
 * `claim` et `putIfPresent` operent sur la meme Map en une seule etape
 * synchrone: c'est l'equivalent en memoire d'une transaction readwrite.
 */
type ClaimingStore = OutboxStore & {
  map: Map<string, OutboxEntry>;
  // Rendues obligatoires ici: ce store EXISTE pour tester la reservation, et
  // l'optionalite de l'interface rendrait chaque appel de test non typable.
  claim: NonNullable<OutboxStore['claim']>;
  putIfPresent: NonNullable<OutboxStore['putIfPresent']>;
};

function claimingStore(seed: OutboxEntry[] = []): ClaimingStore {
  const map = new Map<string, OutboxEntry>(seed.map((e) => [e.id, e]));
  return {
    map,
    async put(entry) {
      map.set(entry.id, entry);
    },
    async getAll() {
      return [...map.values()];
    },
    async delete(id) {
      map.delete(id);
    },
    async claim(id, now, ttlMs) {
      const current = map.get(id);
      if (!current) return false;
      if (current.claimedAt !== undefined && now - current.claimedAt < ttlMs) return false;
      map.set(id, { ...current, claimedAt: now });
      return true;
    },
    async putIfPresent(entry) {
      if (!map.has(entry.id)) return false;
      map.set(entry.id, entry);
      return true;
    },
  };
}

// --- OFF-09: course entre le drain de la page et celui du service worker -----
describe('OFF-09 reservation de rejeu', () => {
  it('refuse un second rejeu tant que la reservation tient', async () => {
    // Le scenario reel: la page draine, le service worker draine en Background
    // Sync au meme instant. Sans reservation, les DEUX rejouent la commande.
    const store = claimingStore([entry('a')]);
    const ob = createOutbox(store);

    const premier = await store.claim('a', CLOCK.now, CLAIM_TTL_MS);
    expect(premier).toBe(true);

    let rejeux = 0;
    const result = await ob.drain(async () => {
      rejeux += 1;
      return { kind: 'success' } as ReplayOutcome;
    }, CLOCK);

    expect(rejeux).toBe(0);
    expect(result.succeeded).toBe(0);
    // L'entree reste en file: elle appartient au contexte qui l'a reservee.
    expect(await ob.count()).toBe(1);
  });

  it('reprend une reservation abandonnee passe le delai', async () => {
    // Onglet ferme ou worker tue en plein rejeu: sans expiration, la commande
    // resterait bloquee jusqu'a MAX_AGE_MS, soit six heures, puis serait perdue.
    const store = claimingStore([entry('a')]);
    const ob = createOutbox(store);

    await store.claim('a', 0, CLAIM_TTL_MS);

    const result = await ob.drain(async () => ({ kind: 'success' }) as ReplayOutcome, {
      now: CLAIM_TTL_MS + 1,
    });

    expect(result.succeeded).toBe(1);
    expect(await ob.count()).toBe(0);
  });

  it('ne ressuscite pas une entree supprimee pendant le rejeu', async () => {
    // Le coeur du constat: le perdant de la course reecrivait l'entree que le
    // gagnant venait de supprimer. La commande revenait en file alors qu'elle
    // etait deja partie, et le compteur affichait un chiffre faux a l'operateur.
    const store = claimingStore([entry('a')]);
    const ob = createOutbox(store);

    const result = await ob.drain(async () => {
      // L'autre contexte termine et supprime pendant notre appel reseau.
      store.map.delete('a');
      return { kind: 'retry', reason: 'hors ligne', countsAsAttempt: false } as ReplayOutcome;
    }, CLOCK);

    expect(await ob.count()).toBe(0);
    expect(result.stillQueued).toBe(0);
  });

  it('rend la reservation quand l entree reste en file', async () => {
    // Une entree gardee apres un echec doit repartir au drain SUIVANT, sans
    // attendre l'expiration: sinon une tablette hors ligne n'enverrait qu'une
    // commande par minute au retour du reseau.
    const store = claimingStore([entry('a')]);
    const ob = createOutbox(store);

    await ob.drain(
      async () =>
        ({ kind: 'retry', reason: 'hors ligne', countsAsAttempt: false }) as ReplayOutcome,
      CLOCK,
    );

    expect(store.map.get('a')?.claimedAt).toBeUndefined();

    const result = await ob.drain(async () => ({ kind: 'success' }) as ReplayOutcome, CLOCK);
    expect(result.succeeded).toBe(1);
  });

  it('draine normalement avec un store sans reservation', async () => {
    // Degradation: les tablettes deja en service portent l'ancien store.
    const store = memoryStore([entry('a')]);
    const ob = createOutbox(store);

    const result = await ob.drain(async () => ({ kind: 'success' }) as ReplayOutcome, CLOCK);

    expect(result.succeeded).toBe(1);
    expect(await ob.count()).toBe(0);
  });
});
