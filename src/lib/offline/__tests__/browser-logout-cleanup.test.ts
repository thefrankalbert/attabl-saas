import { afterEach, describe, expect, it, vi } from 'vitest';

// Audit B65: le stockage de caisse (panier, table choisie, cle d'idempotence)
// n'etait vide qu'APRES des operations qui peuvent lever (purge IndexedDB,
// prepareLogout, persistOutboxIdentity). ShellAccountMenu attrape l'exception
// et deconnecte quand meme: le panier restait pour la personne suivante sur une
// tablette partagee. Il est desormais vide quoi qu'il arrive, sauf quand la
// deconnexion est BLOQUEE (l'utilisateur reste connecte, son panier aussi).

const h = vi.hoisted(() => ({
  outbox: null as null | { countDrainable: () => Promise<number>; drain: () => Promise<unknown> },
  deleteQueryCacheDb: vi.fn(async () => {}),
  prepareLogout: vi.fn(async () => ({ blocked: false, pending: 0, lost: 0 })),
  persistOutboxIdentity: vi.fn(async () => {}),
  clearAdminSessionStorage: vi.fn(),
}));

vi.mock('../outbox-idb', () => ({
  getOrderOutbox: () => h.outbox,
  persistOutboxIdentity: () => h.persistOutboxIdentity(),
}));
vi.mock('../outbox-identity', () => ({ getOutboxIdentity: () => null }));
vi.mock('../submit-order', () => ({ replayOrderEntry: async () => {} }));
vi.mock('../logout-cleanup', () => ({
  deleteQueryCacheDb: () => h.deleteQueryCacheDb(),
  prepareLogout: () => h.prepareLogout(),
}));
vi.mock('@/lib/admin-session-storage', () => ({
  clearAdminSessionStorage: () => h.clearAdminSessionStorage(),
}));

import { prepareLogoutInBrowser } from '../browser-logout-cleanup';

const outbox = { countDrainable: async () => 0, drain: async () => ({}) };

afterEach(() => {
  vi.clearAllMocks();
  h.outbox = null;
  h.deleteQueryCacheDb.mockImplementation(async () => {});
  h.prepareLogout.mockImplementation(async () => ({ blocked: false, pending: 0, lost: 0 }));
  h.persistOutboxIdentity.mockImplementation(async () => {});
});

describe('prepareLogoutInBrowser: le stockage de caisse est vide meme si le nettoyage leve', () => {
  it('sans file IndexedDB, la purge du cache leve: stockage vide quand meme', async () => {
    h.deleteQueryCacheDb.mockRejectedValueOnce(new Error('IndexedDB indisponible'));
    await expect(prepareLogoutInBrowser({ force: true })).rejects.toThrow();
    expect(h.clearAdminSessionStorage).toHaveBeenCalledTimes(1);
  });

  it('avec file, prepareLogout leve: stockage vide quand meme', async () => {
    h.outbox = outbox;
    h.prepareLogout.mockRejectedValueOnce(new Error('quota'));
    await expect(prepareLogoutInBrowser({ force: true })).rejects.toThrow();
    expect(h.clearAdminSessionStorage).toHaveBeenCalledTimes(1);
  });

  it('avec file, l effacement de l identite leve: stockage vide quand meme', async () => {
    h.outbox = outbox;
    h.persistOutboxIdentity.mockRejectedValueOnce(new Error('quota'));
    await expect(prepareLogoutInBrowser({ force: true })).rejects.toThrow();
    expect(h.clearAdminSessionStorage).toHaveBeenCalledTimes(1);
  });

  it('temoin: deconnexion bloquee, l utilisateur reste connecte et garde son panier', async () => {
    h.outbox = outbox;
    h.prepareLogout.mockResolvedValueOnce({ blocked: true, pending: 2, lost: 0 });
    const res = await prepareLogoutInBrowser();
    expect(res.blocked).toBe(true);
    expect(h.clearAdminSessionStorage).not.toHaveBeenCalled();
  });

  it('temoin: nettoyage nominal, stockage vide une fois', async () => {
    h.outbox = outbox;
    await prepareLogoutInBrowser();
    expect(h.clearAdminSessionStorage).toHaveBeenCalledTimes(1);
  });
});
