import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (before importing the route)
// ---------------------------------------------------------------------------

vi.mock('@/lib/csrf', () => ({ verifyOrigin: vi.fn().mockReturnValue(null) }));
const compteur = vi.hoisted(() => ({
  /** Verdict du compteur de COUT par adresse, consomme en tete de route. */
  adresse: { success: true, reset: 0 },
  /** Verdict du compteur (compte, adresse), consomme AVANT d authentifier. */
  paire: { success: true, reset: 0 },
  cles: [] as string[],
}));

vi.mock('@/lib/rate-limit', () => ({
  loginPaireLimiter: {
    check: vi.fn(async (cle: string) => {
      compteur.cles.push(cle);
      return compteur.paire;
    }),
  },
  loginAdresseLimiter: {
    check: vi.fn(async (cle: string) => {
      compteur.cles.push(cle);
      return compteur.adresse;
    }),
  },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  // Regroupement IPv6 /64: l identite en test, le comportement est teste a part.
  grouperAdresse: (ip: string) => ip,
  // Intervalle minimum entre deux envois: libre par defaut.
  envoiAutorisePourCompte: vi.fn().mockResolvedValue(true),
  cleCompte: (email: string) => `empreinte:${email.toLowerCase()}`,
  minutesAvantLiberation: () => 7,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));
vi.mock('@/lib/honeypot', () => ({ isHoneypotTriggered: vi.fn().mockReturnValue(false) }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstileToken: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { POST } from '../login/route';
import { createClient } from '@/lib/supabase/server';

type AdminRow = {
  tenant_id: string;
  is_super_admin: boolean;
  role: string;
  tenants: { slug: string; onboarding_completed: boolean } | null;
};

function mockSupabase(adminUsers: AdminRow[]) {
  return {
    auth: {
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: adminUsers }),
      }),
    }),
  };
}

function buildRequest(): Request {
  return new Request('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ email: 'admin@test.com', password: 'password123' }),
  });
}

async function loginWith(adminUsers: AdminRow[]): Promise<{ status: number; redirect?: string }> {
  vi.mocked(createClient).mockResolvedValue(
    mockSupabase(adminUsers) as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  const res = await POST(buildRequest());
  const json = (await res.json()) as { redirect?: string };
  return { status: res.status, redirect: json.redirect };
}

describe('POST /api/login redirect routing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes a platform super-admin to /admin/platform (not onboarding)', async () => {
    // Super-admin is only attached to __platform (onboarding_completed=false).
    const { status, redirect } = await loginWith([
      {
        tenant_id: 'platform',
        is_super_admin: true,
        role: 'owner',
        tenants: { slug: '__platform', onboarding_completed: false },
      },
    ]);
    expect(status).toBe(200);
    expect(redirect).toBe('/admin/platform');
  });

  it('routes a normal owner with a completed tenant to /admin/tenants', async () => {
    const { redirect } = await loginWith([
      {
        tenant_id: 't1',
        is_super_admin: false,
        role: 'owner',
        tenants: { slug: 'resto', onboarding_completed: true },
      },
    ]);
    expect(redirect).toBe('/admin/tenants');
  });

  it('routes a user with an unfinished tenant to /onboarding', async () => {
    const { redirect } = await loginWith([
      {
        tenant_id: 't1',
        is_super_admin: false,
        role: 'owner',
        tenants: { slug: 'resto', onboarding_completed: false },
      },
    ]);
    expect(redirect).toBe('/onboarding');
  });
});

// --- Ce qui borne reellement les essais ------------------------------------
/**
 * QUATRE CONCEPTIONS, QUATRE LECONS. Chaque test ci-dessous verrouille un
 * defaut qui a reellement existe dans ce fichier:
 *
 *   v1: compteur par ADRESSE consomme avant la verification du mot de passe.
 *       Une connexion REUSSIE coutait un essai, et l'adresse etant partagee,
 *       quatre employes d'un restaurant se partageaient cinq connexions par
 *       quart d'heure. Mesure en production le 2026-11-08.
 *   v2: refus par COMPTE avant authentification -> quiconque connaissant un
 *       email verrouillait ce compte en boucle.
 *   v3: comptage apres l'echec seulement -> plafond decoratif, 800 essais par
 *       heure sur un compte (constat d'audit).
 *   v4: garde atomique sur le COUPLE (compte, adresse), consommee avant
 *       d'authentifier. Elle borne vraiment, et elle ne permet pas de
 *       verrouiller autrui depuis une autre adresse.
 */
describe('POST /api/login - ce qui borne les essais', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compteur.adresse = { success: true, reset: 0 };
    compteur.paire = { success: true, reset: 0 };
    compteur.cles = [];
  });

  function requete(email = 'patron@exemple.test') {
    return new Request('https://attabl.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'motdepasse123' }),
    });
  }

  function supabaseQuiRefuse(code: string) {
    return {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: { code } }),
      },
    };
  }

  /**
   * LA PROPRIETE CENTRALE: la garde porte sur le couple, pas sur le compte
   * seul. Un attaquant depuis une autre adresse epuise SON budget, jamais
   * celui du proprietaire.
   */
  it('compte la tentative sur le couple (compte, adresse)', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase([]) as never);

    await POST(requete());

    expect(compteur.cles).toEqual(['127.0.0.1', 'empreinte:patron@exemple.test:127.0.0.1']);
  });

  /**
   * Le plafond doit etre atteint AVANT que Supabase ne verifie le mot de
   * passe. Sinon chaque requete teste quand meme un mot de passe et le plafond
   * ne borne rien - c'etait le defaut de la v3, mesure a 800 essais par heure.
   */
  it('couple plein: refus 429 SANS jamais appeler Supabase', async () => {
    compteur.paire = { success: false, reset: Date.now() + 420_000 };
    const supabase = mockSupabase([]);
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(requete());

    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain('rateLimitedMinutes');
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('garde de cout par adresse: refus avant meme de lire le corps', async () => {
    compteur.adresse = { success: false, reset: Date.now() + 420_000 };
    const supabase = mockSupabase([]);
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(requete());

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    // La garde du couple n'est meme pas consultee: inutile de lire le corps.
    expect(compteur.cles).toEqual(['127.0.0.1']);
  });

  it('un mauvais mot de passe rend 401, pas 429, tant que le plafond tient', async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseQuiRefuse('invalid_credentials') as never);

    const res = await POST(requete());

    expect(res.status).toBe(401);
  });

  it('un email non confirme rend 403', async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseQuiRefuse('email_not_confirmed') as never);

    const res = await POST(requete());

    expect(res.status).toBe(403);
  });

  /**
   * Deux comptes differents depuis la meme adresse ne se partagent PAS le
   * budget serre: c'est tout l'objet du changement, et ce que la v1 violait.
   */
  it('deux comptes distincts ont deux budgets distincts', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase([]) as never);

    await POST(requete('patron@exemple.test'));
    await POST(requete('serveur@exemple.test'));

    const clesDeCouple = compteur.cles.filter((c) => c.startsWith('empreinte:'));
    expect(new Set(clesDeCouple).size).toBe(2);
  });
});
