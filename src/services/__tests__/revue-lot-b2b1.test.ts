/**
 * Revue ligne par ligne, lot B2b-1: les corrections TypeScript qui n'ont pas
 * de fichier de test naturel.
 *
 * - B62: la branche TABLE_ACTIVE_ORDER de createOrderWithItems etait morte (la
 *   fonction stockee ne leve plus cette erreur). Une erreur de la fonction est
 *   desormais toujours une erreur interne.
 * - B146: idem pour INSUFFICIENT_STOCK dans destockOrder.
 * - B122: un nom de table egal au numero d'une autre table est refuse par la
 *   base (23505, migration 20261124150400); le service le dit clairement.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCreationMethods } from '../order/order-creation';
import { createInventoryService } from '../inventory.service';
import { createTableConfigService } from '../table-config.service';
import { createCouponService } from '../coupon.service';
import type { OrderItemInput } from '@/lib/validations/order.schema';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('B62: plus de branche TABLE_ACTIVE_ORDER', () => {
  it('une erreur de create_order_with_items est INTERNAL, meme si elle cite TABLE_ACTIVE_ORDER', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'next_order_number') return { data: 'CMD-20261124-001', error: null };
      return { data: null, error: { message: 'TABLE_ACTIVE_ORDER' } };
    });
    const service = createCreationMethods({ rpc } as unknown as SupabaseClient);

    await expect(
      service.createOrderWithItems({
        tenantId: 't-1',
        items: [{ id: 'i-1', name: 'Plat', price: 5000, quantity: 1 }] as OrderItemInput[],
        total: 5000,
        display_currency: 'XOF',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

describe('B146: plus de branche INSUFFICIENT_STOCK', () => {
  it('une erreur de destock_order est INTERNAL, meme si elle cite INSUFFICIENT_STOCK', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'INSUFFICIENT_STOCK' } }));
    const service = createInventoryService({ rpc } as unknown as SupabaseClient);

    await expect(service.destockOrder('o-1', 't-1')).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

describe('B122: nom de table egal au numero d une autre table', () => {
  function clientAvecMiseAJour(erreur: { code?: string; message: string } | null) {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { zone: { venue: { tenant_id: 't-1' } } }, error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: erreur });
    const from = vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
      update: vi.fn(() => ({ eq: updateEq })),
    }));
    return { from } as unknown as SupabaseClient;
  }

  it('le refus de la base (23505) devient un CONFLICT lisible', async () => {
    const service = createTableConfigService(
      clientAvecMiseAJour({ code: '23505', message: 'table_display_name_is_other_table_number' }),
    );

    await expect(service.updateTableDisplayName('t-1', 'table-1', 'T2')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: "Ce nom est deja le numero d'une autre table du restaurant.",
    });
  });

  it('temoin: une autre panne reste INTERNAL', async () => {
    const service = createTableConfigService(
      clientAvecMiseAJour({ code: '08006', message: 'connexion perdue' }),
    );

    await expect(service.updateTableDisplayName('t-1', 'table-1', 'T2')).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });

  it('temoin: un renommage accepte ne leve rien', async () => {
    const service = createTableConfigService(clientAvecMiseAJour(null));

    await expect(
      service.updateTableDisplayName('t-1', 'table-1', 'Terrasse'),
    ).resolves.toBeUndefined();
  });
});

describe('B122: un numero genere egal au NOM d une autre table', () => {
  function clientAvecInsertion(erreur: { code?: string; message: string } | null) {
    const ownership = vi.fn().mockResolvedValue({ data: [{ id: 'zone-1' }], error: null });
    const from = vi.fn((table: string) => {
      if (table === 'zones') {
        return { select: vi.fn(() => ({ in: vi.fn(() => ({ eq: ownership })) })) };
      }
      return { insert: vi.fn().mockResolvedValue({ error: erreur }) };
    });
    return { from } as unknown as SupabaseClient;
  }
  const lot = [
    {
      zone_id: 'zone-1',
      table_number: 'TER-4',
      display_name: 'TER-4',
      capacity: 4,
      is_active: true,
    },
  ];

  it('dit quelle table renommer', async () => {
    const service = createTableConfigService(
      clientAvecInsertion({
        code: '23505',
        message: 'table_number_is_other_table_display_name: TER-4',
      }),
    );

    await expect(service.insertTables('t-1', lot)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: `Une autre table s'appelle déjà "TER-4". Renommez-la, puis ajoutez vos tables.`,
    });
  });

  it('temoin: un vrai doublon de numero garde son message', async () => {
    const service = createTableConfigService(
      clientAvecInsertion({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      }),
    );

    await expect(service.insertTables('t-1', lot)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Ce numéro de table existe déjà dans le restaurant.',
    });
  });
});

describe('B67: rendu du coupon a partir de la commande', () => {
  it('appelle rendre_coupon_commande avec la commande et le restaurant, jamais un coupon', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const service = createCouponService({ rpc } as unknown as SupabaseClient);

    await expect(service.releaseForCancelledOrder('o-1', 't-1')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('rendre_coupon_commande', {
      p_order_id: 'o-1',
      p_tenant_id: 't-1',
    });
  });

  it('ne leve jamais: un echec est journalise et renvoie false (rejouable)', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'boom' } }));
    const service = createCouponService({ rpc } as unknown as SupabaseClient);

    await expect(service.releaseForCancelledOrder('o-1', 't-1')).resolves.toBe(false);
  });
});
