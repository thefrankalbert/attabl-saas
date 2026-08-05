import { describe, it, expect, vi } from 'vitest';
import { prepareLogout, type LogoutCleanupDeps } from '../logout-cleanup';

function makeDeps(overrides: Partial<LogoutCleanupDeps> = {}) {
  const deps: LogoutCleanupDeps = {
    countPending: vi.fn().mockResolvedValue(0),
    drain: vi.fn().mockResolvedValue({ lost: 0 }),
    deleteQueryCache: vi.fn().mockResolvedValue(undefined),
    isOnline: vi.fn().mockReturnValue(true),
    ...overrides,
  };
  return deps;
}

describe('prepareLogout', () => {
  it('purge le cache de lecture et autorise la deconnexion quand la file est vide', async () => {
    const deps = makeDeps();

    const result = await prepareLogout(deps);

    expect(result).toEqual({ blocked: false, pending: 0, lost: 0 });
    expect(deps.deleteQueryCache).toHaveBeenCalledOnce();
  });

  it('BLOQUE la deconnexion et ne supprime rien quand des commandes attendent hors ligne', async () => {
    // Le scenario qui ferait perdre de l'argent: des commandes encaissees mais
    // pas encore parties, et pas de reseau pour les envoyer.
    const deps = makeDeps({
      countPending: vi.fn().mockResolvedValue(3),
      isOnline: vi.fn().mockReturnValue(false),
    });

    const result = await prepareLogout(deps);

    expect(result).toEqual({ blocked: true, pending: 3, lost: 0 });
    expect(deps.deleteQueryCache).not.toHaveBeenCalled();
    // Hors ligne, on ne consomme pas le budget de tentatives de la file.
    expect(deps.drain).not.toHaveBeenCalled();
  });

  it('draine avant de conclure quand le reseau est disponible, puis laisse passer', async () => {
    const countPending = vi
      .fn()
      .mockResolvedValueOnce(2) // avant le drain
      .mockResolvedValueOnce(0); // apres le drain
    const deps = makeDeps({ countPending });

    const result = await prepareLogout(deps);

    expect(deps.drain).toHaveBeenCalledOnce();
    expect(result).toEqual({ blocked: false, pending: 0, lost: 0 });
    expect(deps.deleteQueryCache).toHaveBeenCalledOnce();
  });

  it('bloque quand le drain en ligne n a pas suffi a vider la file', async () => {
    const countPending = vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const deps = makeDeps({ countPending });

    const result = await prepareLogout(deps);

    expect(deps.drain).toHaveBeenCalledOnce();
    expect(result).toEqual({ blocked: true, pending: 2, lost: 0 });
    expect(deps.deleteQueryCache).not.toHaveBeenCalled();
  });
  it('BLOQUE et signale quand le drain a DETRUIT des commandes expirees', async () => {
    // Le drain supprime les entrees de plus de 6h. Sans cette remontee, elles
    // disparaissaient pendant la deconnexion: compteur a zero, ecran normal,
    // argent envole sans que personne ne sache qu'il a existe.
    const countPending = vi.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(0);
    const deps = makeDeps({ countPending, drain: vi.fn().mockResolvedValue({ lost: 4 }) });

    const result = await prepareLogout(deps);

    expect(result).toEqual({ blocked: true, pending: 0, lost: 4 });
    expect(deps.deleteQueryCache).not.toHaveBeenCalled();
  });

  it('force: laisse sortir sans JAMAIS toucher a la file, mais purge le cache de lecture', async () => {
    // Sans porte de sortie, une panne reseau en fin de service immobiliserait la
    // tablette: file impossible a vider donc deconnexion impossible, donc le
    // serveur suivant ne peut pas prendre son poste. Le forcage laisse sortir,
    // et surtout ne supprime PAS les commandes encaissees.
    const deps = makeDeps({
      countPending: vi.fn().mockResolvedValue(3),
      isOnline: vi.fn().mockReturnValue(false),
    });

    const result = await prepareLogout(deps, { force: true });

    expect(result).toEqual({ blocked: false, pending: 3, lost: 0 });
    // Le cache de LECTURE part quand meme: c'est lui qui exposerait le chiffre
    // d'affaires de la session precedente au serveur suivant.
    expect(deps.deleteQueryCache).toHaveBeenCalledOnce();
    // La file, elle, est intacte: aucun drain force, aucune suppression.
    expect(deps.drain).not.toHaveBeenCalled();
  });

  it('force: remonte quand meme les commandes detruites par le drain', async () => {
    // Forcer ne doit pas rendre la perte silencieuse: si le drain a supprime des
    // entrees expirees, l'appelant doit pouvoir le dire a l'operateur.
    const countPending = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const deps = makeDeps({ countPending, drain: vi.fn().mockResolvedValue({ lost: 2 }) });

    const result = await prepareLogout(deps, { force: true });

    expect(result).toEqual({ blocked: false, pending: 0, lost: 2 });
    expect(deps.deleteQueryCache).toHaveBeenCalledOnce();
  });
});
