import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import '../zod-fr-error-map';

describe('zod-fr-error-map', () => {
  it('traduit un depassement de longueur sans message explicite', () => {
    const r = z.object({ name: z.string().max(100) }).safeParse({ name: 'x'.repeat(101) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Le nom ne doit pas dépasser 100 caractères.');
  });

  it('garde le message explicite du schema', () => {
    const r = z
      .object({ name: z.string().min(2, 'Trop court chez nous') })
      .safeParse({ name: 'a' });
    expect(r.error?.issues[0]?.message).toBe('Trop court chez nous');
  });

  it('nomme le champ invalide', () => {
    const r = z.object({ name: z.string() }).safeParse({});
    expect(r.error?.issues[0]?.message).toBe('Le nom est invalide ou manquant.');
  });
});
