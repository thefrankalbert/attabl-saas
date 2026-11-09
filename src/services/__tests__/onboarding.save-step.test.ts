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
