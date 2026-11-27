import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const { taches, sendNewLoginEmail } = vi.hoisted(() => ({
  taches: [] as Array<() => Promise<void>>,
  sendNewLoginEmail: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('next/server', () => ({ after: (f: () => Promise<void>) => taches.push(f) }));
vi.mock('@/services/email.service', () => ({
  createEmailService: () => ({ sendNewLoginEmail }),
}));

import {
  APPAREIL_CONNU_COOKIE,
  cookieAppareilDeLaRequete,
  estAppareilConnu,
  marquerAppareilConnu,
} from '../appareil-connu';
import { traiterConnexionReussie } from '../alerte-nouvelle-connexion';

const IL_Y_A_UN_AN = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();

function client(reserve: boolean | null, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: reserve, error }));
  return { rpc, supabase: { rpc } as unknown as SupabaseClient };
}

async function viderTaches() {
  for (const t of taches.splice(0)) await t();
}

describe('appareil connu (cookie signe)', () => {
  beforeEach(() => vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secret-de-test'));
  afterEach(() => vi.unstubAllEnvs());

  it('un cookie marque pour un compte le reconnait, pas un autre compte', () => {
    const cookie = marquerAppareilConnu(undefined, 'u-1');
    expect(estAppareilConnu(cookie, 'u-1')).toBe(true);
    expect(estAppareilConnu(cookie, 'u-2')).toBe(false);
    expect(cookie).not.toContain('u-1');
  });

  it('un cookie falsifie ne vaut rien', () => {
    const cookie = marquerAppareilConnu(undefined, 'u-1');
    const [charge] = cookie.split('.');
    expect(estAppareilConnu(`${charge}.AAAA`, 'u-1')).toBe(false);
  });

  it('garde au plus 5 comptes, les plus recents', () => {
    let cookie: string | undefined;
    for (let i = 1; i <= 6; i++) cookie = marquerAppareilConnu(cookie, `u-${i}`);
    expect(estAppareilConnu(cookie, 'u-6')).toBe(true);
    expect(estAppareilConnu(cookie, 'u-2')).toBe(true);
    expect(estAppareilConnu(cookie, 'u-1')).toBe(false);
  });

  it('lit le cookie dans l en-tete de la requete', () => {
    const req = new Request('https://attabl.com', {
      headers: { cookie: `a=1; ${APPAREIL_CONNU_COOKIE}=abc.def=; b=2` },
    });
    expect(cookieAppareilDeLaRequete(req)).toBe('abc.def=');
  });
});

describe('traiterConnexionReussie', () => {
  const base = {
    userId: 'u-1',
    email: 'gerant@exemple.com',
    compteCreeLe: IL_Y_A_UN_AN,
    methode: 'mot_de_passe' as const,
  };

  beforeEach(() => {
    taches.length = 0;
    sendNewLoginEmail.mockReset();
    sendNewLoginEmail.mockResolvedValue({ success: true });
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secret-de-test');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('appareil inconnu: e-mail avec le lien de changement de mot de passe, cookie pose', async () => {
    const { supabase, rpc } = client(true);
    const cookie = await traiterConnexionReussie({ ...base, supabase, cookieAppareil: undefined });
    await viderTaches();
    expect(rpc).toHaveBeenCalledWith('reserver_alerte_nouvelle_connexion');
    expect(sendNewLoginEmail).toHaveBeenCalledWith(
      'gerant@exemple.com',
      expect.objectContaining({
        methode: 'mot_de_passe',
        changePasswordUrl: 'https://attabl.com/forgot-password',
      }),
    );
    expect(cookie && estAppareilConnu(cookie, 'u-1')).toBe(true);
  });

  it('le lien de l e-mail vient de l adresse configuree du site, jamais de la requete', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://attabl.com');
    const { supabase } = client(true);
    await traiterConnexionReussie({ ...base, supabase, cookieAppareil: undefined });
    await viderTaches();
    const donnees = sendNewLoginEmail.mock.calls[0][1] as { changePasswordUrl: string };
    expect(donnees.changePasswordUrl).toBe('https://attabl.com/forgot-password');
    // Temoin: changer l'adresse configuree change bien le lien.
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://autre.example');
    sendNewLoginEmail.mockClear();
    await traiterConnexionReussie({ ...base, supabase, cookieAppareil: undefined });
    await viderTaches();
    const temoin = sendNewLoginEmail.mock.calls[0][1] as { changePasswordUrl: string };
    expect(temoin.changePasswordUrl).toBe('https://autre.example/forgot-password');
  });

  it('appareil connu: ni reservation ni e-mail (temoin)', async () => {
    const { supabase, rpc } = client(true);
    const cookie = await traiterConnexionReussie({
      ...base,
      supabase,
      cookieAppareil: marquerAppareilConnu(undefined, 'u-1'),
    });
    await viderTaches();
    expect(cookie).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(sendNewLoginEmail).not.toHaveBeenCalled();
  });

  it('plafond atteint (deja une alerte dans l heure): pas d e-mail, cookie pose', async () => {
    const { supabase } = client(false);
    const cookie = await traiterConnexionReussie({ ...base, supabase, cookieAppareil: undefined });
    await viderTaches();
    expect(sendNewLoginEmail).not.toHaveBeenCalled();
    expect(cookie).not.toBeNull();
  });

  it('compte cree il y a moins d une heure: pas d alerte', async () => {
    const { supabase, rpc } = client(true);
    await traiterConnexionReussie({
      ...base,
      compteCreeLe: new Date().toISOString(),
      supabase,
      cookieAppareil: undefined,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('jamais bloquant: une reservation en erreur ou une RPC qui leve ne propagent rien', async () => {
    const enErreur = client(null, { message: 'function does not exist' });
    await expect(
      traiterConnexionReussie({ ...base, supabase: enErreur.supabase, cookieAppareil: undefined }),
    ).resolves.not.toBeNull();

    const quiLeve = {
      rpc: async () => {
        throw new Error('reseau');
      },
    } as unknown as SupabaseClient;
    await expect(
      traiterConnexionReussie({ ...base, supabase: quiLeve, cookieAppareil: undefined }),
    ).resolves.not.toBeNull();
    expect(sendNewLoginEmail).not.toHaveBeenCalled();
  });

  it('secret de signature absent: rien, sans lever', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { supabase, rpc } = client(true);
    await expect(
      traiterConnexionReussie({ ...base, supabase, cookieAppareil: undefined }),
    ).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
