/**
 * Tests de la liaison IndexedDB de la file de commandes.
 *
 * Ils tournent sur `fake-indexeddb`, la seule dependance de developpement du
 * projet pour ce besoin: le code teste ici est justement celui qu'aucun mock
 * maison ne couvre honnetement. Les transactions readwrite d'OFF-09 n'ont de
 * sens que face a une VRAIE implementation IndexedDB - un faux store en Map
 * validerait la logique metier mais pas l'atomicite, qui est tout l'enjeu.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  createIdbOutboxStore,
  persistOutboxIdentity,
  readOutboxIdentity,
  getOrderOutbox,
} from '../outbox-idb';
import { CLAIM_TTL_MS, type OutboxEntry } from '../outbox';

function entry(id: string, createdAt = 0): OutboxEntry {
  return {
    id,
    endpoint: '/api/orders/pos',
    body: { client_request_id: id },
    createdAt,
    attempts: 0,
  };
}

beforeEach(() => {
  // Base neuve a chaque test: IndexedDB persiste entre les tests d'un meme
  // fichier, et une entree oubliee ferait passer un test pour de mauvaises
  // raisons.
  globalThis.indexedDB = new IDBFactory();
});

describe('createIdbOutboxStore', () => {
  it('ecrit, relit et supprime une entree', async () => {
    const store = createIdbOutboxStore();
    await store.put(entry('a'));

    expect((await store.getAll()).map((e) => e.id)).toEqual(['a']);

    await store.delete('a');
    expect(await store.getAll()).toEqual([]);
  });

  it('remplace une entree de meme cle plutot que de la dupliquer', async () => {
    // La cle est l'idempotency key: deux entrees de meme id feraient partir la
    // meme commande deux fois.
    const store = createIdbOutboxStore();
    await store.put(entry('a'));
    await store.put({ ...entry('a'), attempts: 3 });

    const all = await store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.attempts).toBe(3);
  });

  it('supprimer une entree absente ne leve pas', async () => {
    const store = createIdbOutboxStore();
    await expect(store.delete('fantome')).resolves.toBeUndefined();
  });
});

// --- OFF-09: atomicite reelle, face a une vraie IndexedDB -------------------
describe('reservation de rejeu (OFF-09)', () => {
  it('accorde la reservation puis la refuse tant qu elle tient', async () => {
    const store = createIdbOutboxStore();
    await store.put(entry('a'));

    expect(await store.claim!('a', 1_000, CLAIM_TTL_MS)).toBe(true);
    // Le service worker tente sa chance une seconde plus tard.
    expect(await store.claim!('a', 2_000, CLAIM_TTL_MS)).toBe(false);
  });

  it('persiste claimedAt dans la base, pas seulement en memoire', async () => {
    // Le drain de la page et celui du worker sont deux contextes: la
    // reservation ne vaut que si elle est ECRITE.
    const store = createIdbOutboxStore();
    await store.put(entry('a'));
    await store.claim!('a', 1_000, CLAIM_TTL_MS);

    const relu = await createIdbOutboxStore().getAll();
    expect(relu[0]?.claimedAt).toBe(1_000);
  });

  it('reprend une reservation expiree', async () => {
    const store = createIdbOutboxStore();
    await store.put(entry('a'));
    await store.claim!('a', 0, CLAIM_TTL_MS);

    expect(await store.claim!('a', CLAIM_TTL_MS + 1, CLAIM_TTL_MS)).toBe(true);
  });

  it('refuse de reserver une entree disparue, sans la recreer', async () => {
    // Le point exact de la resurrection: l'autre contexte a fini et supprime.
    const store = createIdbOutboxStore();

    expect(await store.claim!('jamais-mise-en-file', 0, CLAIM_TTL_MS)).toBe(false);
    expect(await store.getAll()).toEqual([]);
  });

  it('putIfPresent ecrit quand l entree est encore la', async () => {
    const store = createIdbOutboxStore();
    await store.put(entry('a'));

    expect(await store.putIfPresent!({ ...entry('a'), attempts: 5 })).toBe(true);
    expect((await store.getAll())[0]?.attempts).toBe(5);
  });

  it('putIfPresent ne ressuscite PAS une entree supprimee', async () => {
    // Sans cette garde, une commande deja partie revenait en file et le
    // compteur affichait un chiffre faux a l'operateur.
    const store = createIdbOutboxStore();

    expect(await store.putIfPresent!(entry('deja-partie'))).toBe(false);
    expect(await store.getAll()).toEqual([]);
  });
});

// --- OFF-06: journal des pertes definitives --------------------------------
describe('journal des entrees rejetees', () => {
  it('journalise, relit et vide', async () => {
    const store = createIdbOutboxStore();
    await store.putRejected!({ ...entry('perdue'), lastError: 'expired' });

    const listed = await store.listRejected!();
    expect(listed.map((e) => e.id)).toEqual(['perdue']);
    expect(listed[0]?.lastError).toBe('expired');

    await store.clearRejected!();
    expect(await store.listRejected!()).toEqual([]);
  });

  it('garde le journal separe de la file active', async () => {
    // Une commande perdue ne doit pas etre rejouee: si les deux stores se
    // melangeaient, le drain la renverrait.
    const store = createIdbOutboxStore();
    await store.put(entry('en-file'));
    await store.putRejected!(entry('perdue'));

    expect((await store.getAll()).map((e) => e.id)).toEqual(['en-file']);
    expect((await store.listRejected!()).map((e) => e.id)).toEqual(['perdue']);
  });
});

// --- OFF-07: identite lisible depuis le service worker ---------------------
describe('identite persistee', () => {
  it('ecrit puis relit l identite courante', async () => {
    await persistOutboxIdentity({ userId: 'u1', tenantId: 't1' });
    expect(await readOutboxIdentity()).toEqual({ userId: 'u1', tenantId: 't1' });
  });

  it('efface l identite avec null', async () => {
    // A la deconnexion: sans effacement, le worker rejouerait les commandes du
    // serveur precedent sous son nom.
    await persistOutboxIdentity({ userId: 'u1', tenantId: 't1' });
    await persistOutboxIdentity(null);

    expect(await readOutboxIdentity()).toBeNull();
  });

  it('renvoie null quand rien n a jamais ete ecrit', async () => {
    expect(await readOutboxIdentity()).toBeNull();
  });

  it('remplace l identite au changement de session', async () => {
    await persistOutboxIdentity({ userId: 'u1', tenantId: 't1' });
    await persistOutboxIdentity({ userId: 'u2', tenantId: 't2' });

    expect(await readOutboxIdentity()).toEqual({ userId: 'u2', tenantId: 't2' });
  });
});

describe('getOrderOutbox', () => {
  it('rend une file utilisable quand IndexedDB existe', async () => {
    const ob = getOrderOutbox();
    expect(ob).not.toBeNull();
    expect(await ob!.count()).toBe(0);
  });
});
