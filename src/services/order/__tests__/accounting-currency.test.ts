import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCreationMethods } from '../order-creation';
import { ServiceError } from '../../errors';
import { fromMinorUnits } from '@/lib/utils/money';
import type { OrderItemInput } from '@/lib/validations/order.schema';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

/** Capture les arguments passes a create_order_with_items. */
function mockSupabase() {
  const calls: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'next_order_number') return { data: 'CMD-20260808-001', error: null };
    calls.push(args);
    return { data: { orderId: 'o-1', orderNumber: 'CMD-20260808-001', total: 0 }, error: null };
  });
  return { client: { rpc } as unknown as SupabaseClient, calls };
}

const items = [{ id: 'i-1', name: 'Plat', price: 5000, quantity: 1 }] as OrderItemInput[];

/**
 * Constat F2 du dossier, test d'acceptation.
 *
 * `orders.display_currency` recevait la preference d'AFFICHAGE du client, une
 * valeur de localStorage envoyee dans le corps de la requete. Or le montant est
 * calcule dans la devise du TENANT. Un panier de 5 000 XAF affiche en EUR etait
 * donc converti par `toMinorUnits(5000, 'EUR')` en 500 000, puis relu a
 * l'encaissement comme 5 000,00 EUR - environ 3,3 millions XAF pour une addition
 * de 5 000. Le miroir existait cote POS, qui n'envoyait rien du tout: la devise
 * retombait sur XAF (zero decimale) et 12,50 EUR devenait 13, relu 0,13 EUR.
 */
describe('devise de comptabilisation (F2)', () => {
  it('stocke le montant dans la devise du tenant, pas celle affichee au client', async () => {
    const { client, calls } = mockSupabase();
    const service = createCreationMethods(client);

    // Ce que la route passe desormais: tenant.currency, jamais le corps.
    await service.createOrderWithItems({
      tenantId: 't-1',
      items,
      total: 5000,
      display_currency: 'XAF',
    });

    const args = calls[0];
    expect(args.p_total).toBe(5000);
    expect(args.p_display_currency).toBe('XAF');
    // Le facteur 100 fautif aurait donne 500000.
    expect(args.p_total).not.toBe(500000);
  });

  it('aller-retour exact sur une devise a deux decimales', async () => {
    const { client, calls } = mockSupabase();
    const service = createCreationMethods(client);

    await service.createOrderWithItems({
      tenantId: 't-eur',
      items: [{ id: 'i-1', name: 'Plat', price: 12.5, quantity: 1 }] as OrderItemInput[],
      total: 12.5,
      display_currency: 'EUR',
    });

    const stored = calls[0].p_total as number;
    expect(stored).toBe(1250);
    expect(fromMinorUnits(stored, 'EUR')).toBe(12.5);
  });

  it('refuse bruyamment une commande sans devise de comptabilisation', async () => {
    const { client, calls } = mockSupabase();
    const service = createCreationMethods(client);

    await expect(
      service.createOrderWithItems({ tenantId: 't-1', items, total: 5000 }),
    ).rejects.toBeInstanceOf(ServiceError);

    // Rien n'est ecrit: un montant faux vaut moins qu'une erreur.
    expect(calls).toHaveLength(0);
  });
});
