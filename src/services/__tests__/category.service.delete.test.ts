import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCategoryService } from '../category.service';
import { ServiceError } from '../errors';

/**
 * Audit ui-carte KO 9 (C28): PostgREST ne leve aucune erreur sur un DELETE qui
 * ne touche rien. La suppression doit le dire au lieu d'annoncer un succes.
 */
function client(resultat: { error: unknown; count: number | null }) {
  const appels = { delete: vi.fn(), eq: [] as Array<[string, string]> };
  const chaine = {
    eq(col: string, val: string) {
      appels.eq.push([col, val]);
      return appels.eq.length === 2 ? Promise.resolve(resultat) : chaine;
    },
  };
  const supabase = {
    from: () => ({
      delete: (opts: unknown) => {
        appels.delete(opts);
        return chaine;
      },
    }),
  } as unknown as SupabaseClient;
  return { supabase, appels };
}

describe('deleteCategory', () => {
  it('demande le compte exact et filtre par restaurant', async () => {
    const { supabase, appels } = client({ error: null, count: 1 });
    await createCategoryService(supabase).deleteCategory('cat-1', 'tenant-a');
    expect(appels.delete).toHaveBeenCalledWith({ count: 'exact' });
    expect(appels.eq).toEqual([
      ['id', 'cat-1'],
      ['tenant_id', 'tenant-a'],
    ]);
  });

  it('rien supprime (categorie d un autre restaurant): erreur NOT_FOUND', async () => {
    const { supabase } = client({ error: null, count: 0 });
    await expect(
      createCategoryService(supabase).deleteCategory('cat-autre', 'tenant-a'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('erreur de base: INTERNAL', async () => {
    const { supabase } = client({ error: { message: 'x' }, count: null });
    await expect(
      createCategoryService(supabase).deleteCategory('cat-1', 'tenant-a'),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
