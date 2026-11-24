import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { saveOnboardingStep } from '../onboarding.save-step';
import { ServiceError } from '../errors';

function client(progressError: unknown): SupabaseClient {
  return {
    from: (table: string) => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: table === 'onboarding_progress' ? progressError : null }),
    }),
  } as unknown as SupabaseClient;
}

describe('saveOnboardingStep', () => {
  it('leve quand le brouillon ne s enregistre pas', async () => {
    // Le brouillon EST le point de reprise: avalee, cette erreur faisait
    // afficher "enregistre" alors que rien n etait garde.
    await expect(
      saveOnboardingStep(client({ message: 'refus' }), 't1', 4, {}, { menuItems: [] }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it('reussit quand le brouillon s enregistre', async () => {
    await expect(
      saveOnboardingStep(client(null), 't1', 4, {}, { menuItems: [] }),
    ).resolves.toBeUndefined();
  });
});

describe('saveOnboardingStep: validation par etape (B10, B59)', () => {
  function recordingClient() {
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from: () => ({
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
        upsert: async () => ({ error: null }),
      }),
    } as unknown as SupabaseClient;
    return { supabase, updates };
  }

  const LOGO = 'https://abc.supabase.co/storage/v1/object/public/logos/t1/logo.png';

  it.each([
    ['couleur non hexa', 3, { primaryColor: 'red' }],
    ['logo hors stockage de l application', 3, { logoUrl: 'https://evil.example/x.png' }],
    ['description sans limite', 3, { description: 'x'.repeat(501) }],
    ['type d etablissement inconnu', 1, { establishmentType: 'casino' }],
    ['nom trop long', 1, { tenantName: 'n'.repeat(201) }],
    ['nombre de tables hors bornes', 1, { tableCount: 100000 }],
  ])('refuse %s sans rien ecrire', async (_cas, step, data) => {
    const { supabase, updates } = recordingClient();
    await expect(saveOnboardingStep(supabase, 't1', step, data)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(updates).toHaveLength(0);
  });

  it('ecrit les valeurs validees de l etape 3 (couleur courte developpee)', async () => {
    const { supabase, updates } = recordingClient();
    await saveOnboardingStep(supabase, 't1', 3, {
      logoUrl: LOGO,
      primaryColor: '#c0f',
      secondaryColor: '#000000',
      description: 'Grillades',
    });
    expect(updates[0]).toEqual({
      logo_url: LOGO,
      primary_color: '#CC00FF',
      secondary_color: '#000000',
      description: 'Grillades',
    });
  });

  it('accepte un logo vide (pas de logo)', async () => {
    const { supabase, updates } = recordingClient();
    await saveOnboardingStep(supabase, 't1', 3, { logoUrl: '' });
    expect(updates[0]).toMatchObject({ logo_url: '' });
  });
});
