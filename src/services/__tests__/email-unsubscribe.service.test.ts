import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createEmailUnsubscribeService } from '../email-unsubscribe.service';
import { ServiceError } from '../errors';

type Call = [string, ...unknown[]];

/** Fausse base: retient chaque appel de la chaine et rend `result`. */
function fakeDb(result: { data?: unknown; error?: unknown }) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      calls.push(['from', table]);
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'in', 'upsert', 'delete', 'eq']) {
        chain[m] = (...args: unknown[]) => (calls.push([m, ...args]), chain);
      }
      chain.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(ok);
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('createEmailUnsubscribeService', () => {
  it('findUnsubscribed lit une seule fois, sans doublon, et rend les adresses trouvees', async () => {
    const { client, calls } = fakeDb({ data: [{ email_normalized: 'a@x.test' }] });
    const found = await createEmailUnsubscribeService(client).findUnsubscribed([
      'a@x.test',
      'b@x.test',
      'a@x.test',
    ]);
    expect([...found]).toEqual(['a@x.test']);
    expect(calls).toEqual([
      ['from', 'email_unsubscribes'],
      ['select', 'email_normalized'],
      ['in', 'email_normalized', ['a@x.test', 'b@x.test']],
    ]);
  });

  it('liste vide: aucune lecture', async () => {
    const { client, calls } = fakeDb({});
    expect((await createEmailUnsubscribeService(client).findUnsubscribed([])).size).toBe(0);
    expect(calls).toEqual([]);
  });

  it('isUnsubscribed: vrai seulement pour une adresse trouvee', async () => {
    expect(
      await createEmailUnsubscribeService(
        fakeDb({ data: [{ email_normalized: 'a@x.test' }] }).client,
      ).isUnsubscribed('a@x.test'),
    ).toBe(true);
    expect(
      await createEmailUnsubscribeService(fakeDb({ data: [] }).client).isUnsubscribed('a@x.test'),
    ).toBe(false);
  });

  it('une erreur de lecture LEVE (jamais "pas desabonne" par defaut)', async () => {
    const svc = createEmailUnsubscribeService(fakeDb({ error: { message: 'boom' } }).client);
    await expect(svc.isUnsubscribed('a@x.test')).rejects.toBeInstanceOf(ServiceError);
  });

  it('unsubscribe: insertion idempotente (doublon ignore)', async () => {
    const { client, calls } = fakeDb({});
    await createEmailUnsubscribeService(client).unsubscribe('a@x.test');
    expect(calls).toContainEqual([
      'upsert',
      { email_normalized: 'a@x.test' },
      { onConflict: 'email_normalized', ignoreDuplicates: true },
    ]);
  });

  it('resubscribe: suppression de la seule adresse visee', async () => {
    const { client, calls } = fakeDb({});
    await createEmailUnsubscribeService(client).resubscribe('a@x.test');
    expect(calls).toEqual([
      ['from', 'email_unsubscribes'],
      ['delete'],
      ['eq', 'email_normalized', 'a@x.test'],
    ]);
  });

  it('ecriture en echec: ServiceError', async () => {
    const svc = createEmailUnsubscribeService(fakeDb({ error: { message: 'boom' } }).client);
    await expect(svc.unsubscribe('a@x.test')).rejects.toBeInstanceOf(ServiceError);
    await expect(svc.resubscribe('a@x.test')).rejects.toBeInstanceOf(ServiceError);
  });
});
