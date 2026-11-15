/**
 * Lecture de l'etat d'onboarding (reprise apres deconnexion).
 *
 * Verrouille: les DEFAUTS DE LA BASE (XAF, Cameroun) ne sont jamais proposes
 * comme un choix du restaurateur tant qu'il n'a pas fini; le brouillon gagne
 * toujours; une lecture ratee ne se deguise pas en "aucune progression".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const tenantResult: { data: unknown; error: unknown } = { data: null, error: null };
const progressResult: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => tenantResult }),
      }),
    }),
  }),
}));

import { getOnboardingState } from '../onboarding.state';
import { ServiceError } from '../errors';

function userClient(): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => progressResult }),
      }),
    }),
  } as unknown as SupabaseClient;
}

function tenant(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    slug: 'chez-amadou',
    name: 'Chez Amadou',
    establishment_type: 'restaurant',
    address: null,
    city: null,
    // Valeurs par defaut de la colonne en base, PAS un choix du restaurateur.
    country: 'Cameroun',
    currency: 'XAF',
    phone: null,
    table_count: 10,
    logo_url: null,
    primary_color: '#C5A065',
    secondary_color: '#000000',
    description: null,
    default_locale: 'fr-FR',
    establishment_details: {},
    onboarding_completed: false,
    ...over,
  };
}

beforeEach(() => {
  tenantResult.data = tenant();
  tenantResult.error = null;
  progressResult.data = null;
  progressResult.error = null;
});

describe('getOnboardingState', () => {
  it('propose XOF / Burkina Faso, pas les defauts de la base, a un nouveau restaurant', async () => {
    // Avant: le serveur renvoyait XAF/Cameroun et ecrasait le XOF de l'ecran.
    const s = await getOnboardingState(userClient(), 't1');
    expect(s.data.currency).toBe('XOF');
    expect(s.data.country).toBe('Burkina Faso');
    expect(s.step).toBe(0);
    expect(s.completed).toBe(false);
  });

  it('annonce un abonnement requis seulement pour un gel trial_expired (P-05)', async () => {
    tenantResult.data = tenant({ subscription_status: 'frozen', freeze_reason: 'trial_expired' });
    expect((await getOnboardingState(userClient(), 't1')).needsSubscription).toBe(true);
  });

  it('temoin: essai en cours, ou autre cause de gel, ne declenche pas le message', async () => {
    for (const over of [
      { subscription_status: 'trial', freeze_reason: null },
      { subscription_status: 'frozen', freeze_reason: 'dispute' },
      {},
    ]) {
      tenantResult.data = tenant(over);
      expect((await getOnboardingState(userClient(), 't1')).needsSubscription).toBe(false);
    }
  });

  it('garde le choix enregistre dans le brouillon', async () => {
    progressResult.data = {
      step: 1,
      completed: false,
      draft: { currency: 'XAF', country: 'Tchad' },
    };
    const s = await getOnboardingState(userClient(), 't1');
    expect(s.data.currency).toBe('XAF');
    expect(s.data.country).toBe('Tchad');
    expect(s.step).toBe(1);
  });

  it('rend les colonnes telles quelles une fois l onboarding fini', async () => {
    tenantResult.data = tenant({ onboarding_completed: true, currency: 'EUR', country: 'France' });
    const s = await getOnboardingState(userClient(), 't1');
    expect(s.completed).toBe(true);
    expect(s.data.currency).toBe('EUR');
    expect(s.data.country).toBe('France');
  });

  it('restaure la langue et les details du type depuis le restaurant', async () => {
    tenantResult.data = tenant({
      default_locale: 'en-US',
      establishment_details: { starRating: 3, hasRestaurant: true },
    });
    const s = await getOnboardingState(userClient(), 't1');
    expect(s.data.language).toBe('en-US');
    expect(s.data.starRating).toBe(3);
    expect(s.data.hasRestaurant).toBe(true);
  });

  it('le brouillon gagne sur les colonnes, champ par champ', async () => {
    tenantResult.data = tenant({ logo_url: 'https://x/old.png' });
    progressResult.data = {
      step: 3,
      completed: false,
      draft: { logoUrl: 'https://x/new.png', tenantName: 'Nouveau nom', _phase: 1, _subScreen: 1 },
    };
    const s = await getOnboardingState(userClient(), 't1');
    expect(s.data.logoUrl).toBe('https://x/new.png');
    expect(s.tenantName).toBe('Nouveau nom');
  });

  it('echoue au lieu de rendre un formulaire vide quand la progression est illisible', async () => {
    // Un formulaire vide serait auto-sauvegarde par-dessus le vrai brouillon.
    progressResult.error = { message: 'timeout' };
    await expect(getOnboardingState(userClient(), 't1')).rejects.toBeInstanceOf(ServiceError);
  });

  it('echoue sur un restaurant introuvable ou illisible', async () => {
    tenantResult.data = null;
    await expect(getOnboardingState(userClient(), 't1')).rejects.toBeInstanceOf(ServiceError);
    tenantResult.error = { message: 'timeout' };
    await expect(getOnboardingState(userClient(), 't1')).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('getOnboardingState - une seule source pour "fini"', () => {
  it('suit le drapeau du restaurant, pas la ligne de progression', () => {
    // Deux sources divergentes renvoyaient l'utilisateur en boucle entre
    // l'onboarding et la fenetre "reprendre".
    tenantResult.data = tenant({ onboarding_completed: false });
    progressResult.data = { step: 5, completed: true, draft: null };
    return getOnboardingState(userClient(), 't1').then((s) => expect(s.completed).toBe(false));
  });
});
