import { describe, it, expect, vi, beforeEach } from 'vitest';

import { assertTenantServing, TenantLockedError } from '../assert-tenant-serving';
import { AuthError } from '@/lib/auth/get-session';

// Le client par defaut (service_role) importe 'server-only'. Chaque test injecte
// sa doublure; ce mock prouve aussi qu'aucun ne retombe sur le client reel.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('client service_role reel appele dans un test');
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/**
 * Pourquoi ces tests. Trois composants de l'interface admin appellent les
 * actions d'argent EN DIRECT, sans passer par `/api/orders/mutations`: la
 * coupure posee sur la route ne les couvrait pas, et le middleware ne refuse
 * que `frozen`, `is_active = false` et `suspended_at`. Pour `cancelled`,
 * `paused`, `unpaid`, `incomplete` et `pending`, l'argent bougeait encore.
 *
 * Ces tests figent les deux proprietes qui comptent: la liste exacte des
 * statuts refuses, et le fait que la garde echoue FERMEE (ligne absente ou
 * erreur de lecture = refus, jamais autorisation).
 */

interface LigneTenant {
  is_active?: boolean | null;
  suspended_at?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  stripe_subscription_id?: string | null;
}

/** Client Supabase minimal: enregistre les filtres pour pouvoir les verifier. */
function clientAvec(reponse: { data: LigneTenant | null; error: unknown }) {
  const appels = { table: '', colonnes: '', filtreId: '', filtreSupprime: false };
  const chaine = {
    select: vi.fn((c: string) => {
      appels.colonnes = c;
      return chaine;
    }),
    eq: vi.fn((_col: string, valeur: string) => {
      appels.filtreId = valeur;
      return chaine;
    }),
    is: vi.fn((col: string) => {
      if (col === 'deleted_at') appels.filtreSupprime = true;
      return chaine;
    }),
    maybeSingle: vi.fn().mockResolvedValue(reponse),
  };
  const client = {
    from: vi.fn((t: string) => {
      appels.table = t;
      return chaine;
    }),
  };
  return { client, appels };
}

const SERVANT: LigneTenant = {
  is_active: true,
  suspended_at: null,
  subscription_status: 'active',
};

describe('assertTenantServing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('laisse passer un restaurant qui sert', async () => {
    const { client } = clientAvec({ data: SERVANT, error: null });
    await expect(assertTenantServing('t-1', client as never)).resolves.toBeUndefined();
  });

  it('lit la bonne table, les colonnes de coupure, et exclut les supprimes', async () => {
    const { client, appels } = clientAvec({ data: SERVANT, error: null });
    await assertTenantServing('t-42', client as never);

    expect(appels.table).toBe('tenants');
    expect(appels.colonnes).toBe(
      'is_active, suspended_at, subscription_status, trial_ends_at, stripe_subscription_id',
    );
    expect(appels.filtreId).toBe('t-42');
    // Sans ce filtre, un restaurant supprime serait juge sur des colonnes
    // devenues sans objet.
    expect(appels.filtreSupprime).toBe(true);
  });

  const casCoupes: [string, LigneTenant][] = [
    ['desactive', { ...SERVANT, is_active: false }],
    ['suspendu par le super-admin', { ...SERVANT, suspended_at: '2026-11-01T00:00:00Z' }],
    ['gele', { ...SERVANT, subscription_status: 'frozen' }],
    // Les cinq statuts que le middleware laisse passer: c'est precisement le
    // trou que cette garde ferme.
    ['resilie', { ...SERVANT, subscription_status: 'cancelled' }],
    ['en pause', { ...SERVANT, subscription_status: 'paused' }],
    ['impaye', { ...SERVANT, subscription_status: 'unpaid' }],
    ['incomplet', { ...SERVANT, subscription_status: 'incomplete' }],
    ['en attente', { ...SERVANT, subscription_status: 'pending' }],
    // Le cron ne gele qu'a 02:00: jusqu'a 24 h d'encaissement gratuit sinon.
    [
      'en essai expire, pas encore gele',
      {
        ...SERVANT,
        subscription_status: 'trial',
        trial_ends_at: '2020-01-01T00:00:00Z',
        stripe_subscription_id: null,
      },
    ],
  ];

  it.each(casCoupes)('refuse un restaurant %s', async (_nom, ligne) => {
    const { client } = clientAvec({ data: ligne, error: null });
    await expect(assertTenantServing('t-1', client as never)).rejects.toBeInstanceOf(
      TenantLockedError,
    );
  });

  const casServants: [string, LigneTenant][] = [
    [
      'en essai',
      { ...SERVANT, subscription_status: 'trial', trial_ends_at: '2999-01-01T00:00:00Z' },
    ],
    ['en retard de paiement', { ...SERVANT, subscription_status: 'past_due' }],
  ];

  // Volontaire: la relance Stripe est en cours et le cron de gel les borne dans
  // le temps. Couper ici, c'est couper un client qui va payer.
  it.each(casServants)('laisse servir un restaurant %s', async (_nom, ligne) => {
    const { client } = clientAvec({ data: ligne, error: null });
    await expect(assertTenantServing('t-1', client as never)).resolves.toBeUndefined();
  });

  it('refuse quand la ligne est absente', async () => {
    const { client } = clientAvec({ data: null, error: null });
    await expect(assertTenantServing('t-1', client as never)).rejects.toBeInstanceOf(
      TenantLockedError,
    );
  });

  it('refuse quand la lecture echoue (echec ferme)', async () => {
    const { client } = clientAvec({ data: null, error: { message: 'boom' } });
    await expect(assertTenantServing('t-1', client as never)).rejects.toBeInstanceOf(
      TenantLockedError,
    );
  });

  it('refuse une ligne vide: une colonne oubliee ne doit jamais ouvrir', async () => {
    const { client } = clientAvec({ data: {}, error: null });
    await expect(assertTenantServing('t-1', client as never)).rejects.toBeInstanceOf(
      TenantLockedError,
    );
  });

  it('est attrape par les catch AuthError existants, en 403', async () => {
    const { client } = clientAvec({
      data: { ...SERVANT, subscription_status: 'cancelled' },
      error: null,
    });
    // Les actions font `if (err instanceof AuthError) return { error: err.message }`.
    // Si TenantLockedError cessait d'en heriter, elles repondraient "Erreur
    // interne" au lieu du vrai motif.
    await expect(assertTenantServing('t-1', client as never)).rejects.toBeInstanceOf(AuthError);
    await assertTenantServing('t-1', client as never).catch((err) => {
      expect(err).toBeInstanceOf(TenantLockedError);
      expect((err as TenantLockedError).status).toBe(403);
      expect((err as TenantLockedError).message).toBe(
        'Ce restaurant est temporairement indisponible',
      );
    });
  });
});
