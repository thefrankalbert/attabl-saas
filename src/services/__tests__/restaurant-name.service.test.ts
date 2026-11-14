import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRestaurantNameTaken } from '../restaurant-name.service';
import { ServiceError } from '../errors';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function client(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('isRestaurantNameTaken (A-08)', () => {
  it('delegue au predicat de la base (RPC) avec le nom sans espaces de bord', async () => {
    const { client: c, rpc } = client({ data: true, error: null });
    expect(await isRestaurantNameTaken(c, '  Chez Awa ')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('is_tenant_name_taken', { p_name: 'Chez Awa' });
  });

  it('faux quand le nom est libre', async () => {
    const { client: c } = client({ data: false, error: null });
    expect(await isRestaurantNameTaken(c, 'Chez Awa')).toBe(false);
  });

  it('un nom vide n appelle pas la base', async () => {
    const { client: c, rpc } = client({ data: true, error: null });
    expect(await isRestaurantNameTaken(c, '   ')).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('echoue FERME: erreur ou reponse inattendue leve, jamais un passage silencieux', async () => {
    await expect(
      isRestaurantNameTaken(client({ data: null, error: { message: 'db down' } }).client, 'X'),
    ).rejects.toBeInstanceOf(ServiceError);
    await expect(
      isRestaurantNameTaken(client({ data: 'oui', error: null }).client, 'X'),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
