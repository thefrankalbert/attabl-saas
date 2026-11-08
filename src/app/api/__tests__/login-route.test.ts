import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (before importing the route)
// ---------------------------------------------------------------------------

vi.mock('@/lib/csrf', () => ({ verifyOrigin: vi.fn().mockReturnValue(null) }));
const compteur = vi.hoisted(() => ({
  /** Verdict rendu par le compteur d'ADRESSE, consomme atomiquement en amont. */
  adresse: { success: true, reset: 0 },
  /** Verdict rendu APRES comptage d'un echec sur le compteur du COMPTE. */
  apresEchecCompte: { success: true, reset: 0 },
  echecsComptes: [] as string[],
  effacements: [] as string[],
}));

vi.mock('@/lib/rate-limit', () => ({
  loginCompteLimiter: {
    compterEchec: vi.fn(async (cle: string) => {
      compteur.echecsComptes.push(`compte:${cle}`);
      return compteur.apresEchecCompte;
    }),
    effacer: vi.fn(async (cle: string) => {
      compteur.effacements.push(cle);
    }),
  },
  loginAdresseLimiter: {
    check: vi.fn(async () => compteur.adresse),
    compterEchec: vi.fn(async () => {
      compteur.echecsComptes.push('adresse');
      return { success: true, reset: 0 };
    }),
    effacer: vi.fn(async () => {
      compteur.effacements.push('adresse');
    }),
  },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
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

// --- Ce qui est compte, et quand -------------------------------------------
/**
 * TROIS DEFAUTS REELS SONT VERROUILLES ICI.
 *
 * 1. Le compteur etait consomme AVANT la verification du mot de passe: entrer
 *    correctement coutait un essai. Comme il comptait par ADRESSE IP, les
 *    quatre employes d'un restaurant sur le meme Wi-Fi se partageaient cinq
 *    connexions par quart d'heure (mesure en production le 2026-11-08).
 * 2. Une premiere correction refusait AVANT l'authentification sur le compteur
 *    du COMPTE: quiconque connaissant un email pouvait verrouiller ce compte
 *    15 minutes, en boucle. Un mot de passe correct doit toujours passer.
 * 3. Elle lisait aussi le compteur avant de compter l'echec, ce qui n'est pas
 *    atomique: cent requetes simultanees passaient toutes la lecture.
 */
describe('POST /api/login - comptage des tentatives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compteur.adresse = { success: true, reset: 0 };
    compteur.apresEchecCompte = { success: true, reset: 0 };
    compteur.echecsComptes = [];
    compteur.effacements = [];
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

  it('une connexion REUSSIE ne compte aucun echec', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase([]) as never);

    const res = await POST(requete());

    expect(res.status).toBe(200);
    expect(compteur.echecsComptes).toEqual([]);
  });

  it('une connexion REUSSIE efface le compteur du compte, et pas celui de l adresse', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase([]) as never);

    await POST(requete());

    // Effacer le compteur de l'adresse laisserait un attaquant possedant un
    // compte valide remettre le sien a zero entre deux rafales.
    expect(compteur.effacements).toEqual(['empreinte:patron@exemple.test']);
  });

  /**
   * LE VERROUILLAGE CIBLE. C'est la propriete la plus importante du fichier:
   * meme compteur de compte plein - donc meme apres qu'un tiers ait use les 20
   * echecs sur cet email - le proprietaire entre avec son mot de passe.
   */
  it('un mot de passe CORRECT passe meme quand le compteur du compte est plein', async () => {
    compteur.apresEchecCompte = { success: false, reset: Date.now() + 420_000 };
    vi.mocked(createClient).mockResolvedValue(mockSupabase([]) as never);

    const res = await POST(requete());

    expect(res.status).toBe(200);
  });

  it('un mauvais mot de passe compte un echec sur le compte, une seule fois', async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseQuiRefuse('invalid_credentials') as never);

    const res = await POST(requete());

    expect(res.status).toBe(401);
    // Le compteur d'adresse a deja ete consomme en amont: le recompter
    // punirait deux fois la meme tentative.
    expect(compteur.echecsComptes).toEqual(['compte:empreinte:patron@exemple.test']);
  });

  it('au-dela de la limite d echecs, le refus passe de 401 a 429 avec le delai', async () => {
    compteur.apresEchecCompte = { success: false, reset: Date.now() + 420_000 };
    vi.mocked(createClient).mockResolvedValue(supabaseQuiRefuse('invalid_credentials') as never);

    const res = await POST(requete());

    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain('rateLimitedMinutes');
  });

  /**
   * `email_not_confirmed` signifie que le mot de passe etait BON. Compter cet
   * echec punirait quelqu'un qui n'a pas encore clique dans son mail de
   * bienvenue - et qui ne peut rien y faire en reessayant.
   */
  it('un email non confirme ne compte PAS comme un echec', async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseQuiRefuse('email_not_confirmed') as never);

    const res = await POST(requete());

    expect(res.status).toBe(403);
    expect(compteur.echecsComptes).toEqual([]);
  });

  it('compteur d adresse plein: refus 429 sans jamais appeler Supabase', async () => {
    compteur.adresse = { success: false, reset: Date.now() + 420_000 };
    const supabase = mockSupabase([]);
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(requete());

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
